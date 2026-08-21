#!/usr/bin/env python3
"""
send_metrics.py — Módulo de envío de métricas acústicas al sistema central.

Lee los archivos JSON generados por process_audio.py y los envía
a la Ingestion API del servidor central. Tras un envío exitoso,
elimina el archivo .txt local y lo remueve del index.json.

Uso:
    python scripts/send_metrics.py
    python scripts/send_metrics.py --once        # Ejecuta un solo ciclo y termina
    python scripts/send_metrics.py --status      # Muestra cuántos archivos hay pendientes
"""

import argparse
import base64
import binascii
import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path

import httpx
from dotenv import load_dotenv

from index_lock import index_lock

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
load_dotenv(PROJECT_DIR / ".env")


def _project_path(value: str, default: Path) -> Path:
    path = Path(value) if value else default
    return path if path.is_absolute() else PROJECT_DIR / path

# ── Configuración desde .env ───────────────────────────────────────────────────
STATION_CODE          = os.getenv("STATION_CODE", "")
STATION_SECRET        = os.getenv("STATION_SECRET", "")
SERVER_URL            = os.getenv("SERVER_URL", "").rstrip("/")
RUNTIME_DIR           = _project_path(os.getenv("RUNTIME_DIR", ""), PROJECT_DIR / "runtime")
METRICS_OUTPUT_DIR    = _project_path(
    os.getenv("METRICS_OUTPUT_DIR", ""), RUNTIME_DIR / "audio_stats"
)
SEND_INTERVAL_SECONDS = int(os.getenv("SEND_INTERVAL_SECONDS", "30"))
MAX_RETRIES           = int(os.getenv("MAX_RETRIES", "3"))
MAX_BACKLOG           = int(os.getenv("MAX_BACKLOG", "100"))

INGEST_URL = f"{SERVER_URL}/ingest/ingest"
AUTH_URL   = f"{SERVER_URL}/auth/token"

TOKEN_FILE        = RUNTIME_DIR / "token.json"
FAILED_FILES_FILE = RUNTIME_DIR / "failed_files.json"

RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s",
    handlers=[
        logging.FileHandler(RUNTIME_DIR / "send_metrics.log"),
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)

BOGOTA_TZ = timezone(timedelta(hours=-5))


class TokenRequestError(RuntimeError):
    """No se pudo obtener un token de estación."""


class SendOutcome(str, Enum):
    """Resultado de procesar un archivo local."""

    SENT = "sent"
    RETRY = "retry"
    PERMANENT_FAILURE = "permanent_failure"
    CLEANUP_PENDING = "cleanup_pending"


RETRYABLE_HTTP_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}

REQUIRED_METRIC_FIELDS = {
    "timestamp",
    "filename",
    "duration",
    "sample_rate",
    "is_stereo",
    "dbfs_level",
    "rms_energy",
    "leq_dbfs",
    "ch_left_dbfs",
    "ch_right_dbfs",
    "ch_left_rms",
    "ch_right_rms",
    "ild_db",
    "interaural_correlation",
    "dominant_frequency",
    "spectral_centroid",
    "spectral_rolloff",
    "zero_crossing_rate",
}

NON_NEGATIVE_METRIC_FIELDS = {
    "duration",
    "rms_energy",
    "ch_left_rms",
    "ch_right_rms",
    "dominant_frequency",
    "spectral_centroid",
    "spectral_rolloff",
    "zero_crossing_rate",
}

# =============================================================================
# VALIDACIÓN DE CONFIGURACIÓN
# =============================================================================

def validate_config():
    missing = []
    if not STATION_CODE:  missing.append("STATION_CODE")
    if not STATION_SECRET: missing.append("STATION_SECRET")
    if not SERVER_URL:    missing.append("SERVER_URL")
    if missing:
        logger.error(f"Variables de entorno requeridas no definidas: {', '.join(missing)}")
        sys.exit(1)
    if not METRICS_OUTPUT_DIR.is_dir():
        logger.error(f"La carpeta de métricas no existe: {METRICS_OUTPUT_DIR}")
        sys.exit(1)
    if SEND_INTERVAL_SECONDS <= 0:
        logger.error("SEND_INTERVAL_SECONDS debe ser mayor que cero")
        sys.exit(1)
    if MAX_RETRIES <= 0:
        logger.error("MAX_RETRIES debe ser mayor que cero")
        sys.exit(1)
    if MAX_BACKLOG <= 0:
        logger.error("MAX_BACKLOG debe ser mayor que cero")
        sys.exit(1)


# =============================================================================
# GESTIÓN DEL TOKEN JWT
# =============================================================================

def _parse_datetime(value) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _token_expiration(token: str) -> datetime | None:
    """Lee el claim exp del JWT sin sustituir la validación del servidor."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
        exp = claims.get("exp")
        if isinstance(exp, bool) or not isinstance(exp, (int, float)):
            return None
        if not math.isfinite(float(exp)):
            return None
        return datetime.fromtimestamp(float(exp), tz=timezone.utc)
    except (ValueError, TypeError, KeyError, json.JSONDecodeError,
            UnicodeDecodeError, binascii.Error, OverflowError, OSError):
        return None


def load_token() -> str | None:
    if not TOKEN_FILE.exists():
        return None
    try:
        data = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        token = data["token"]
        if not isinstance(token, str) or not token:
            return None

        # Preferir la expiración real del JWT. El campo local se conserva como
        # compatibilidad con token.json generados por versiones anteriores.
        expires_at = _token_expiration(token) or _parse_datetime(data.get("expires_at"))
        if expires_at is None:
            logger.warning("token.json no contiene una expiración válida.")
            return None
        if (expires_at - datetime.now(timezone.utc)).total_seconds() < 86400:
            logger.info("Token por vencer, se renovará.")
            return None
        return token
    except Exception as e:
        logger.warning(f"No se pudo leer token.json: {e}")
        return None


def request_token() -> str:
    logger.info(f"Solicitando token JWT para estación: {STATION_CODE}")
    try:
        response = httpx.post(
            AUTH_URL,
            json={"stationCode": STATION_CODE, "secret": STATION_SECRET},
            timeout=10.0,
        )
    except httpx.TimeoutException as exc:
        raise TokenRequestError("Timeout al solicitar el token.") from exc
    except httpx.NetworkError as exc:
        raise TokenRequestError("No se pudo conectar al servicio de autenticación.") from exc
    except httpx.HTTPError as exc:
        raise TokenRequestError("Error HTTP al solicitar el token.") from exc

    if response.status_code != 200:
        raise TokenRequestError(
            f"Auth Service respondió HTTP {response.status_code}."
        )

    try:
        token = response.json()["token"]
    except (ValueError, KeyError, TypeError) as exc:
        raise TokenRequestError("Auth Service devolvió un token inválido.") from exc

    if not isinstance(token, str) or not token:
        raise TokenRequestError("Auth Service devolvió un token vacío.")

    expires_at = _token_expiration(token)
    token_data = {"token": token}
    if expires_at is not None:
        token_data["expires_at"] = expires_at.isoformat()
    else:
        logger.warning("El JWT no contiene exp; no se podrá reutilizar con seguridad.")

    try:
        TOKEN_FILE.write_text(json.dumps(token_data, indent=2), encoding="utf-8")
    except OSError as exc:
        raise TokenRequestError("No se pudo guardar token.json.") from exc

    logger.info("Token JWT obtenido y guardado.")
    return token


def get_token() -> str:
    token = load_token()
    return token if token else request_token()


# =============================================================================
# GESTIÓN DE INDEX.JSON (lectura + escritura)
# =============================================================================

def _safe_metric_path(filename: str) -> Path:
    """Devuelve una ruta de métrica confinada a METRICS_OUTPUT_DIR."""
    if (
        not isinstance(filename, str)
        or not filename
        or Path(filename).name != filename
        or filename in {".", ".."}
        or not filename.lower().endswith(".txt")
    ):
        raise ValueError(f"Nombre de archivo no válido: {filename!r}")

    base_dir = METRICS_OUTPUT_DIR.resolve()
    file_path = (base_dir / filename).resolve()
    try:
        file_path.relative_to(base_dir)
    except ValueError as exc:
        raise ValueError(f"Ruta fuera de la carpeta de métricas: {filename!r}") from exc
    return file_path


def read_index() -> list[str]:
    """Lee index.json. Devuelve lista vacía si no existe o está siendo escrito."""
    index_path = METRICS_OUTPUT_DIR / "index.json"
    if not index_path.exists():
        return []
    with index_lock(index_path):
        try:
            files = json.loads(index_path.read_text(encoding="utf-8"))
            if not isinstance(files, list) or not all(isinstance(item, str) for item in files):
                raise ValueError("index.json debe contener una lista de nombres")
            return sorted(set(files))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            # Un índice inválido se reintentará en el siguiente ciclo. El
            # bloqueo compartido evita que coincida con una escritura válida.
            logger.warning(f"index.json no disponible o inválido: {exc}")
            return []


def remove_from_index(filename: str) -> bool:
    """
    Elimina un archivo del index.json tras enviarlo exitosamente.
    Usa escritura en archivo temporal + rename para evitar corrupción
    si process_audio.py escribe al mismo tiempo.
    """
    index_path = METRICS_OUTPUT_DIR / "index.json"
    if not index_path.exists():
        return True
    try:
        with index_lock(index_path):
            current = json.loads(index_path.read_text(encoding="utf-8"))
            if not isinstance(current, list):
                raise ValueError("index.json debe contener una lista")
            updated = [f for f in current if f != filename]

            # Escritura atómica dentro del bloqueo compartido.
            tmp_path = index_path.with_suffix(".tmp")
            tmp_path.write_text(
                json.dumps(updated, ensure_ascii=False, indent=4),
                encoding="utf-8",
            )
            tmp_path.replace(index_path)
        return True
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        logger.warning(f"No se pudo actualizar index.json al eliminar {filename}: {exc}")
        return False


def validate_metrics_payload(metrics: object, filename: str) -> None:
    """Valida localmente el contrato antes de consumir un intento HTTP."""
    if not isinstance(metrics, dict):
        raise ValueError("el contenido debe ser un objeto JSON")

    missing = sorted(REQUIRED_METRIC_FIELDS - metrics.keys())
    if missing:
        raise ValueError(f"faltan campos requeridos: {', '.join(missing)}")

    if not isinstance(metrics["timestamp"], str):
        raise ValueError("timestamp debe ser texto ISO 8601")
    try:
        datetime.fromisoformat(metrics["timestamp"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("timestamp no es ISO 8601 válido") from exc

    if not isinstance(metrics["filename"], str) or not metrics["filename"]:
        raise ValueError("filename debe ser texto no vacío")
    if not isinstance(metrics["is_stereo"], bool):
        raise ValueError("is_stereo debe ser booleano")

    numeric_fields = REQUIRED_METRIC_FIELDS - {"timestamp", "filename", "is_stereo"}
    for field in numeric_fields:
        value = metrics[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{field} debe ser numérico")
        if not math.isfinite(float(value)):
            raise ValueError(f"{field} no puede ser NaN o infinito")

    sample_rate = metrics["sample_rate"]
    if (
        isinstance(sample_rate, bool)
        or not isinstance(sample_rate, (int, float))
        or not float(sample_rate).is_integer()
        or sample_rate <= 0
    ):
        raise ValueError("sample_rate debe ser un entero mayor que cero")

    for field in NON_NEGATIVE_METRIC_FIELDS:
        if metrics[field] < 0:
            raise ValueError(f"{field} no puede ser negativo")

    correlation = metrics["interaural_correlation"]
    if not -1.0 <= correlation <= 1.0:
        raise ValueError("interaural_correlation debe estar entre -1 y 1")


# =============================================================================
# ARCHIVOS FALLIDOS
# =============================================================================

def load_failed_files() -> dict:
    if not FAILED_FILES_FILE.exists():
        return {}
    try:
        failed = json.loads(FAILED_FILES_FILE.read_text(encoding="utf-8"))
        if not isinstance(failed, dict):
            raise ValueError("failed_files.json debe contener un objeto")
        return {
            filename: count
            for filename, count in failed.items()
            if isinstance(filename, str) and isinstance(count, int) and count >= 0
        }
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        logger.warning("No se pudo leer failed_files.json; se iniciará sin contadores.")
        return {}


def save_failed_files(failed: dict):
    tmp_path = FAILED_FILES_FILE.with_suffix(".tmp")
    try:
        tmp_path.write_text(
            json.dumps(failed, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(FAILED_FILES_FILE)
    except OSError as exc:
        logger.error(f"No se pudo guardar failed_files.json: {exc}")


# =============================================================================
# CÁLCULO DE PENDIENTES
# =============================================================================

def get_pending_files(index: list[str], failed: dict) -> list[str]:
    """
    Archivos pendientes = todos los del index que no superaron MAX_RETRIES.
    Ya no hay sent_files.json: si el archivo existe en el index es porque
    no fue enviado aún (se elimina del index tras envío exitoso).
    """
    exhausted = {f for f, count in failed.items() if count >= MAX_RETRIES}
    pending = [f for f in index if f not in exhausted]
    if len(pending) > MAX_BACKLOG:
        logger.warning(
            f"{len(pending)} archivos pendientes. Enviando los primeros {MAX_BACKLOG}."
        )
        pending = pending[:MAX_BACKLOG]
    return pending


# =============================================================================
# ENVÍO DE UN ARCHIVO
# =============================================================================

def send_file(filename: str, token: str) -> SendOutcome:
    """
    Lee el .txt, envía las métricas a la Ingestion API y,
    si el envío es exitoso (201 o 200), elimina el .txt y lo
    remueve del index.json.
    """
    try:
        file_path = _safe_metric_path(filename)
    except ValueError as exc:
        logger.error(f"Archivo rechazado por ruta inválida ({filename!r}): {exc}")
        return SendOutcome.PERMANENT_FAILURE

    if not file_path.exists():
        # El archivo puede haber sido eliminado por una ejecución anterior
        # que falló después del borrado pero antes de actualizar el index.
        # En ese caso simplemente lo removemos del index.
        logger.warning(f"Archivo no encontrado en disco, limpiando del index: {filename}")
        return (
            SendOutcome.SENT
            if remove_from_index(filename)
            else SendOutcome.CLEANUP_PENDING
        )

    try:
        metrics = json.loads(file_path.read_text(encoding="utf-8"))
        validate_metrics_payload(metrics, filename)
    except (OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.error(f"Archivo inválido {filename}; no se reintentará: {exc}")
        return SendOutcome.PERMANENT_FAILURE

    metrics["stationCode"] = STATION_CODE

    # Convertir timestamp a formato ISO 8601 con zona horaria (UTC-5)
    if "timestamp" in metrics:
        try:
            dt = datetime.fromisoformat(metrics["timestamp"].replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=BOGOTA_TZ)
            metrics["timestamp"] = dt.isoformat()
        except ValueError as exc:
            # La validación anterior debería impedirlo; se conserva la
            # protección para no enviar un timestamp ambiguo.
            logger.error(f"No se pudo convertir timestamp en {filename}: {exc}")
            return SendOutcome.PERMANENT_FAILURE

    try:
        response = httpx.post(
            INGEST_URL,
            json=metrics,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15.0
        )

        if response.status_code in (200, 201):
            result = "duplicado ignorado" if response.status_code == 200 else "insertado"
            logger.info(f" Enviado ({result}): {filename}")

            # Eliminar archivo local
            try:
                file_path.unlink()
                logger.debug(f"Archivo eliminado del disco: {filename}")
            except OSError as exc:
                # El servidor ya confirmó la medición. No se cuenta como
                # fallo de red: se reintentará solo la limpieza local.
                logger.warning(f"No se pudo eliminar {filename} del disco: {exc}")
                return SendOutcome.CLEANUP_PENDING

            # Remover del index.json
            if not remove_from_index(filename):
                logger.warning(f"El archivo se envió, pero queda pendiente limpiar {filename} del índice.")
                return SendOutcome.CLEANUP_PENDING
            return SendOutcome.SENT

        if response.status_code == 401:
            logger.warning("Token rechazado. Se renovará antes del siguiente intento.")
            if TOKEN_FILE.exists():
                try:
                    TOKEN_FILE.unlink()
                except OSError as exc:
                    logger.warning(f"No se pudo eliminar el token local: {exc}")
            return SendOutcome.RETRY

        if response.status_code in RETRYABLE_HTTP_STATUS_CODES:
            logger.warning(
                f"Error temporal HTTP {response.status_code} al enviar {filename}; se reintentará."
            )
            return SendOutcome.RETRY

        # Los restantes 4xx representan normalmente un payload o una
        # configuración inválida y no deben consumir ciclos indefinidamente.
        logger.error(
            f"Error permanente HTTP {response.status_code} al enviar {filename}: {response.text}"
        )
        return SendOutcome.PERMANENT_FAILURE

    except httpx.TimeoutException:
        logger.warning(f"Timeout al enviar {filename}; se reintentará.")
        return SendOutcome.RETRY
    except httpx.NetworkError as exc:
        logger.warning(f"Error de red al enviar {filename}; se reintentará: {exc}")
        return SendOutcome.RETRY
    except httpx.HTTPError as exc:
        logger.warning(f"Error HTTP al enviar {filename}; se reintentará: {exc}")
        return SendOutcome.RETRY


# =============================================================================
# CICLO PRINCIPAL
# =============================================================================

def run_cycle(token: str | None, failed: dict) -> tuple[str | None, dict]:
    index = read_index()
    if not index:
        logger.debug("index.json vacío o no disponible. Esperando archivos.")
        return token, failed

    pending = get_pending_files(index, failed)
    if not pending:
        logger.debug("No hay archivos pendientes de enviar.")
        return token, failed

    logger.info(f"Archivos pendientes: {len(pending)}")

    for filename in pending:
        try:
            token = get_token()
        except TokenRequestError as exc:
            # No contar el archivo como fallido: el problema es de
            # autenticación/conectividad y no del payload local.
            logger.error(f"No se pudo obtener el token; se reintentará después: {exc}")
            break

        outcome = send_file(filename, token)
        if outcome in {SendOutcome.SENT, SendOutcome.CLEANUP_PENDING}:
            failed.pop(filename, None)
        elif outcome == SendOutcome.PERMANENT_FAILURE:
            # Se conserva el archivo y el registro para diagnóstico, pero no
            # se vuelve a intentar automáticamente un payload inválido.
            failed[filename] = MAX_RETRIES
            logger.error(f"Archivo {filename} marcado como fallo permanente.")
        else:
            failed[filename] = failed.get(filename, 0) + 1
            if failed[filename] >= MAX_RETRIES:
                logger.error(
                    f"Archivo {filename} agotó {MAX_RETRIES} intentos temporales. "
                    "Se pausará hasta intervención manual."
                )

    save_failed_files(failed)
    return token, failed


def show_status():
    index   = read_index()
    failed  = load_failed_files()
    pending = get_pending_files(index, failed)
    exhausted = {f for f, c in failed.items() if c >= MAX_RETRIES}
    eligible_count = sum(1 for filename in index if filename not in exhausted)

    print(f"\n── Estado del módulo de envío ──────────────────")
    print(f"  Estación:           {STATION_CODE}")
    print(f"  Servidor:           {SERVER_URL}")
    print(f"  Carpeta métricas:   {METRICS_OUTPUT_DIR}")
    print(f"  Total en index:     {len(index)}")
    print(f"  Pendientes:         {eligible_count}")
    if eligible_count > len(pending):
        print(f"  En este ciclo:      {len(pending)} (límite MAX_BACKLOG)")
    print(f"  Fallidos (agotados):{len(exhausted)}")
    print(f"  Token:              {'guardado' if TOKEN_FILE.exists() else 'no existe'}")
    print(f"────────────────────────────────────────────────\n")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Módulo de envío de métricas acústicas")
    parser.add_argument("--once",   action="store_true", help="Ejecutar un solo ciclo y terminar")
    parser.add_argument("--status", action="store_true", help="Mostrar estado sin enviar nada")
    args = parser.parse_args()

    validate_config()

    if args.status:
        show_status()
        return

    logger.info(f"Iniciando — estación: {STATION_CODE}, servidor: {SERVER_URL}")

    failed = load_failed_files()
    # El token se obtiene de forma perezosa, únicamente cuando haya archivos
    # pendientes. Así la Raspberry puede arrancar sin servidor disponible.
    token: str | None = None

    if args.once:
        run_cycle(token, failed)
        logger.info("Modo --once completado.")
        return

    logger.info(f"Modo continuo — intervalo: {SEND_INTERVAL_SECONDS}s. Ctrl+C para detener.")
    try:
        while True:
            token, failed = run_cycle(token, failed)
            time.sleep(SEND_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        logger.info("Módulo detenido por el usuario.")
        save_failed_files(failed)


if __name__ == "__main__":
    main()

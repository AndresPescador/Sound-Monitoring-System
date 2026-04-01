#!/usr/bin/env python3
"""
send_metrics.py — Módulo de envío de métricas acústicas al sistema central.

Lee los archivos JSON generados por process_audio.py y los envía
a la Ingestion API del servidor central. Tras un envío exitoso,
elimina el archivo .txt local y lo remueve del index.json.

Uso:
    python send_metrics.py
    python send_metrics.py --once        # Ejecuta un solo ciclo y termina
    python send_metrics.py --status      # Muestra cuántos archivos hay pendientes
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()

# ── Configuración desde .env ───────────────────────────────────────────────────
STATION_CODE          = os.getenv("STATION_CODE", "")
STATION_SECRET        = os.getenv("STATION_SECRET", "")
SERVER_URL            = os.getenv("SERVER_URL", "").rstrip("/")
METRICS_OUTPUT_DIR    = Path(os.getenv("METRICS_OUTPUT_DIR", "./audio_stats"))
SEND_INTERVAL_SECONDS = int(os.getenv("SEND_INTERVAL_SECONDS", "30"))
MAX_RETRIES           = int(os.getenv("MAX_RETRIES", "3"))
MAX_BACKLOG           = int(os.getenv("MAX_BACKLOG", "100"))

INGEST_URL = f"{SERVER_URL}/ingest/ingest"
AUTH_URL   = f"{SERVER_URL}/auth/token"

SCRIPT_DIR        = Path(__file__).parent
TOKEN_FILE        = SCRIPT_DIR / "token.json"
FAILED_FILES_FILE = SCRIPT_DIR / "failed_files.json"

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(levelname)s — %(message)s",
    handlers=[
        logging.FileHandler(SCRIPT_DIR / "send_metrics.log"),
        logging.StreamHandler(sys.stdout),
    ]
)
logger = logging.getLogger(__name__)


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
    if not METRICS_OUTPUT_DIR.exists():
        logger.error(f"La carpeta de métricas no existe: {METRICS_OUTPUT_DIR}")
        sys.exit(1)


# =============================================================================
# GESTIÓN DEL TOKEN JWT
# =============================================================================

def load_token() -> str | None:
    if not TOKEN_FILE.exists():
        return None
    try:
        data = json.loads(TOKEN_FILE.read_text())
        expires_at = datetime.fromisoformat(data["expires_at"])
        if (expires_at - datetime.now(timezone.utc)).total_seconds() < 86400:
            logger.info("Token por vencer, se renovará.")
            return None
        return data["token"]
    except Exception as e:
        logger.warning(f"No se pudo leer token.json: {e}")
        return None


def request_token() -> str:
    logger.info(f"Solicitando token JWT para estación: {STATION_CODE}")
    try:
        response = httpx.post(
            AUTH_URL,
            json={"stationCode": STATION_CODE, "secret": STATION_SECRET},
            timeout=10.0
        )
        if response.status_code == 200:
            token = response.json()["token"]
            TOKEN_FILE.write_text(json.dumps({
                "token": token,
                "expires_at": datetime.fromtimestamp(
                    time.time() + 29 * 86400, tz=timezone.utc
                ).isoformat()
            }, indent=2))
            logger.info("Token JWT obtenido y guardado.")
            return token
        logger.error(f"Error al solicitar token: HTTP {response.status_code} — {response.text}")
        sys.exit(1)
    except httpx.ConnectError:
        logger.error(f"No se pudo conectar al servidor en {AUTH_URL}")
        sys.exit(1)


def get_token() -> str:
    token = load_token()
    return token if token else request_token()


# =============================================================================
# GESTIÓN DE INDEX.JSON (lectura + escritura)
# =============================================================================

def read_index() -> list[str]:
    """Lee index.json. Devuelve lista vacía si no existe o está siendo escrito."""
    index_path = METRICS_OUTPUT_DIR / "index.json"
    if not index_path.exists():
        return []
    try:
        files = json.loads(index_path.read_text(encoding="utf-8"))
        return sorted(files)
    except Exception as e:
        # Puede ocurrir si process_audio.py está escribiendo en este momento.
        # Se maneja silenciosamente y se reintenta en el próximo ciclo.
        logger.debug(f"index.json no disponible momentáneamente: {e}")
        return []


def remove_from_index(filename: str):
    """
    Elimina un archivo del index.json tras enviarlo exitosamente.
    Usa escritura en archivo temporal + rename para evitar corrupción
    si process_audio.py escribe al mismo tiempo.
    """
    index_path = METRICS_OUTPUT_DIR / "index.json"
    if not index_path.exists():
        return
    try:
        current = json.loads(index_path.read_text(encoding="utf-8"))
        updated = [f for f in current if f != filename]

        # Escritura atómica: escribir en temp y luego renombrar
        tmp_path = index_path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(updated, ensure_ascii=False, indent=4),
            encoding="utf-8"
        )
        tmp_path.replace(index_path)  # rename es atómico en Linux
    except Exception as e:
        logger.warning(f"No se pudo actualizar index.json al eliminar {filename}: {e}")


# =============================================================================
# ARCHIVOS FALLIDOS
# =============================================================================

def load_failed_files() -> dict:
    if not FAILED_FILES_FILE.exists():
        return {}
    try:
        return json.loads(FAILED_FILES_FILE.read_text())
    except Exception:
        return {}


def save_failed_files(failed: dict):
    FAILED_FILES_FILE.write_text(json.dumps(failed, indent=2))


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

def send_file(filename: str, token: str) -> bool:
    """
    Lee el .txt, envía las métricas a la Ingestion API y,
    si el envío es exitoso (201 o 200), elimina el .txt y lo
    remueve del index.json.
    """
    file_path = METRICS_OUTPUT_DIR / filename
    if not file_path.exists():
        # El archivo puede haber sido eliminado por una ejecución anterior
        # que falló después del borrado pero antes de actualizar el index.
        # En ese caso simplemente lo removemos del index.
        logger.warning(f"Archivo no encontrado en disco, limpiando del index: {filename}")
        remove_from_index(filename)
        return True

    try:
        metrics = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"No se pudo leer {filename}: {e}")
        return False

    metrics["stationCode"] = STATION_CODE
    
    # Convertir timestamp a formato ISO 8601 con zona horaria (UTC)
    if "timestamp" in metrics:
        try:
            dt = datetime.fromisoformat(metrics["timestamp"])
            # Si no tiene zona horaria, asumir UTC
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            metrics["timestamp"] = dt.isoformat()
        except Exception as e:
            logger.warning(f"No se pudo convertir timestamp en {filename}: {e}")

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
            except Exception as e:
                logger.warning(f"No se pudo eliminar {filename} del disco: {e}")

            # Remover del index.json
            remove_from_index(filename)
            return True

        if response.status_code == 401:
            logger.warning("Token rechazado. Se renovará en el próximo ciclo.")
            if TOKEN_FILE.exists():
                TOKEN_FILE.unlink()
            return False

        logger.error(f" Error HTTP {response.status_code} al enviar {filename}: {response.text}")
        return False

    except httpx.ConnectError:
        logger.error(f" No se pudo conectar al servidor al enviar {filename}.")
        return False
    except httpx.TimeoutException:
        logger.error(f" Timeout al enviar {filename}.")
        return False


# =============================================================================
# CICLO PRINCIPAL
# =============================================================================

def run_cycle(token: str, failed: dict) -> tuple[str, dict]:
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
        token = get_token()
        success = send_file(filename, token)
        if success:
            failed.pop(filename, None)
        else:
            failed[filename] = failed.get(filename, 0) + 1
            if failed[filename] >= MAX_RETRIES:
                logger.error(f"Archivo {filename} superó {MAX_RETRIES} reintentos. Se omitirá.")

    save_failed_files(failed)
    return token, failed


def show_status():
    index   = read_index()
    failed  = load_failed_files()
    pending = get_pending_files(index, failed)
    exhausted = {f for f, c in failed.items() if c >= MAX_RETRIES}

    print(f"\n── Estado del módulo de envío ──────────────────")
    print(f"  Estación:           {STATION_CODE}")
    print(f"  Servidor:           {SERVER_URL}")
    print(f"  Carpeta métricas:   {METRICS_OUTPUT_DIR}")
    print(f"  Total en index:     {len(index)}")
    print(f"  Pendientes:         {len(pending)}")
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
    token  = get_token()

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

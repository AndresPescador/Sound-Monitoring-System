#!/usr/bin/env python3
"""
send_metrics.py — Módulo de envío de métricas acústicas al sistema central.

Lee los archivos JSON generados por process_audio.py y los envía
a la Ingestion API del servidor central de forma continua.

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

# URLs derivadas de SERVER_URL
INGEST_URL    = f"{SERVER_URL}/ingest/ingest"
AUTH_URL      = f"{SERVER_URL}/auth/token"

# Archivos de estado (en la misma carpeta que este script)
SCRIPT_DIR       = Path(__file__).parent
TOKEN_FILE       = SCRIPT_DIR / "token.json"
SENT_FILES_FILE  = SCRIPT_DIR / "sent_files.json"
FAILED_FILES_FILE= SCRIPT_DIR / "failed_files.json"

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
    """Verifica que las variables de entorno requeridas estén definidas."""
    missing = []
    if not STATION_CODE:
        missing.append("STATION_CODE")
    if not STATION_SECRET:
        missing.append("STATION_SECRET")
    if not SERVER_URL:
        missing.append("SERVER_URL")
    if missing:
        logger.error(f"Variables de entorno requeridas no definidas: {', '.join(missing)}")
        logger.error("Copia .env.example como .env y completa los valores.")
        sys.exit(1)
    if not METRICS_OUTPUT_DIR.exists():
        logger.error(f"La carpeta de métricas no existe: {METRICS_OUTPUT_DIR}")
        logger.error("Verifica que METRICS_OUTPUT_DIR sea correcta en el .env.")
        sys.exit(1)


# =============================================================================
# GESTIÓN DEL TOKEN JWT
# =============================================================================

def load_token() -> str | None:
    """
    Carga el token desde token.json si existe y no está expirado.
    Devuelve None si no hay token o está por vencer (menos de 1 día).
    """
    if not TOKEN_FILE.exists():
        return None
    try:
        data = json.loads(TOKEN_FILE.read_text())
        expires_at = datetime.fromisoformat(data["expires_at"])
        now = datetime.now(timezone.utc)
        # Renovar si queda menos de 1 día
        if (expires_at - now).total_seconds() < 86400:
            logger.info("Token por vencer, se renovará.")
            return None
        return data["token"]
    except Exception as e:
        logger.warning(f"No se pudo leer token.json: {e}")
        return None


def request_token() -> str:
    """
    Solicita un nuevo token JWT al Auth Service.
    Guarda el token en token.json y lo devuelve.
    """
    logger.info(f"Solicitando token JWT para estación: {STATION_CODE}")
    try:
        response = httpx.post(
            AUTH_URL,
            json={"stationCode": STATION_CODE, "secret": STATION_SECRET},
            timeout=10.0
        )
        if response.status_code == 200:
            token = response.json()["token"]
            # Calcular expiración (30 días por defecto, ajustar si el servidor lo indica)
            expires_at = datetime.now(timezone.utc).replace(
                microsecond=0
            ).isoformat().replace("+00:00", "Z")
            # Guardar token
            TOKEN_FILE.write_text(json.dumps({
                "token": token,
                # Guardar con 29 días para renovar antes del vencimiento real
                "expires_at": datetime.fromtimestamp(
                    time.time() + 29 * 86400, tz=timezone.utc
                ).isoformat()
            }, indent=2))
            logger.info("Token JWT obtenido y guardado.")
            return token
        else:
            logger.error(f"Error al solicitar token: HTTP {response.status_code} — {response.text}")
            sys.exit(1)
    except httpx.ConnectError:
        logger.error(f"No se pudo conectar al servidor en {AUTH_URL}")
        logger.error("Verifica que el servidor esté encendido y que SERVER_URL sea correcta.")
        sys.exit(1)


def get_token() -> str:
    """Devuelve un token válido, solicitando uno nuevo si es necesario."""
    token = load_token()
    if token is None:
        token = request_token()
    return token


# =============================================================================
# GESTIÓN DE ARCHIVOS ENVIADOS / FALLIDOS
# =============================================================================

def load_sent_files() -> set:
    """Carga el conjunto de archivos ya enviados exitosamente."""
    if not SENT_FILES_FILE.exists():
        return set()
    try:
        return set(json.loads(SENT_FILES_FILE.read_text()))
    except Exception:
        return set()


def save_sent_files(sent: set):
    """Persiste el conjunto de archivos enviados."""
    SENT_FILES_FILE.write_text(json.dumps(sorted(sent), indent=2))


def load_failed_files() -> dict:
    """Carga el registro de archivos fallidos con su contador de reintentos."""
    if not FAILED_FILES_FILE.exists():
        return {}
    try:
        return json.loads(FAILED_FILES_FILE.read_text())
    except Exception:
        return {}


def save_failed_files(failed: dict):
    """Persiste el registro de archivos fallidos."""
    FAILED_FILES_FILE.write_text(json.dumps(failed, indent=2))


# =============================================================================
# LECTURA DEL INDEX Y CÁLCULO DE PENDIENTES
# =============================================================================

def read_index() -> list[str]:
    """
    Lee el archivo index.json generado por process_audio.py.
    Devuelve la lista de nombres de archivos disponibles.
    """
    index_path = METRICS_OUTPUT_DIR / "index.json"
    if not index_path.exists():
        return []
    try:
        files = json.loads(index_path.read_text())
        # Ordenar cronológicamente por nombre (el nombre incluye el timestamp)
        return sorted(files)
    except Exception as e:
        logger.warning(f"No se pudo leer index.json: {e}")
        return []


def get_pending_files(index: list[str], sent: set, failed: dict) -> list[str]:
    """
    Calcula los archivos pendientes de enviar.
    Excluye los ya enviados y los que superaron MAX_RETRIES.
    """
    exhausted = {f for f, count in failed.items() if count >= MAX_RETRIES}
    pending = [f for f in index if f not in sent and f not in exhausted]
    if len(pending) > MAX_BACKLOG:
        logger.warning(
            f"{len(pending)} archivos pendientes. Enviando los primeros {MAX_BACKLOG} "
            f"(MAX_BACKLOG={MAX_BACKLOG})."
        )
        pending = pending[:MAX_BACKLOG]
    return pending


# =============================================================================
# ENVÍO DE UN ARCHIVO
# =============================================================================

def send_file(filename: str, token: str) -> bool:
    """
    Lee un archivo .txt de métricas y lo envía a la Ingestion API.

    El JSON del archivo ya tiene snake_case, que la Ingestion API acepta
    gracias a populate_by_name=True en el modelo Pydantic.

    Returns:
        True si el envío fue exitoso (201 o 200), False en caso de error.
    """
    file_path = METRICS_OUTPUT_DIR / filename
    if not file_path.exists():
        logger.warning(f"Archivo no encontrado, puede haber sido eliminado: {filename}")
        return False

    try:
        metrics = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"No se pudo leer {filename}: {e}")
        return False

    # Adjuntar station_code al payload
    metrics["stationCode"] = STATION_CODE

    try:
        response = httpx.post(
            INGEST_URL,
            json=metrics,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15.0
        )

        if response.status_code == 201:
            logger.info(f"✓ Enviado: {filename}")
            return True

        if response.status_code == 200:
            logger.info(f"✓ Duplicado ignorado (ya existía): {filename}")
            return True

        if response.status_code == 401:
            logger.warning(f"Token rechazado al enviar {filename}. Se renovará en el próximo ciclo.")
            # Forzar renovación del token
            if TOKEN_FILE.exists():
                TOKEN_FILE.unlink()
            return False

        logger.error(f"✗ Error HTTP {response.status_code} al enviar {filename}: {response.text}")
        return False

    except httpx.ConnectError:
        logger.error(f"✗ No se pudo conectar al servidor al enviar {filename}.")
        return False
    except httpx.TimeoutException:
        logger.error(f"✗ Timeout al enviar {filename}.")
        return False


# =============================================================================
# CICLO PRINCIPAL
# =============================================================================

def run_cycle(token: str, sent: set, failed: dict) -> tuple[str, set, dict]:
    """
    Ejecuta un ciclo de envío: lee index.json, calcula pendientes y envía.

    Returns:
        Tupla (token actualizado, sent actualizado, failed actualizado)
    """
    index = read_index()
    if not index:
        logger.debug("index.json vacío o no encontrado. Esperando archivos.")
        return token, sent, failed

    pending = get_pending_files(index, sent, failed)
    if not pending:
        logger.debug("No hay archivos pendientes de enviar.")
        return token, sent, failed

    logger.info(f"Archivos pendientes: {len(pending)}")

    for filename in pending:
        # Verificar token antes de cada envío (puede haber sido invalidado)
        token = get_token()

        success = send_file(filename, token)
        if success:
            sent.add(filename)
            # Limpiar de fallidos si existía
            failed.pop(filename, None)
        else:
            failed[filename] = failed.get(filename, 0) + 1
            if failed[filename] >= MAX_RETRIES:
                logger.error(
                    f"Archivo {filename} superó {MAX_RETRIES} reintentos. "
                    f"Se omitirá en futuros ciclos."
                )

    save_sent_files(sent)
    save_failed_files(failed)
    return token, sent, failed


def show_status():
    """Muestra un resumen del estado actual sin enviar nada."""
    index    = read_index()
    sent     = load_sent_files()
    failed   = load_failed_files()
    pending  = get_pending_files(index, sent, failed)
    exhausted = {f for f, c in failed.items() if c >= MAX_RETRIES}

    print(f"\n── Estado del módulo de envío ──────────────────")
    print(f"  Estación:           {STATION_CODE}")
    print(f"  Servidor:           {SERVER_URL}")
    print(f"  Carpeta métricas:   {METRICS_OUTPUT_DIR}")
    print(f"  Total en index:     {len(index)}")
    print(f"  Ya enviados:        {len(sent)}")
    print(f"  Pendientes:         {len(pending)}")
    print(f"  Fallidos (agotados):{len(exhausted)}")
    token_status = "guardado" if TOKEN_FILE.exists() else "no existe (se solicitará al arrancar)"
    print(f"  Token:              {token_status}")
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

    logger.info(f"Iniciando módulo de envío — estación: {STATION_CODE}, servidor: {SERVER_URL}")

    sent   = load_sent_files()
    failed = load_failed_files()
    token  = get_token()

    if args.once:
        token, sent, failed = run_cycle(token, sent, failed)
        logger.info("Modo --once completado.")
        return

    logger.info(f"Modo continuo — intervalo: {SEND_INTERVAL_SECONDS}s. Ctrl+C para detener.")

    try:
        while True:
            token, sent, failed = run_cycle(token, sent, failed)
            time.sleep(SEND_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        logger.info("Módulo detenido por el usuario.")
        save_sent_files(sent)
        save_failed_files(failed)


if __name__ == "__main__":
    main()

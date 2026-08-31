"""Estado versionado y compatible de fallos de envío.

El formato antiguo era ``{"archivo.txt": 3}``. La lectura lo conserva y
clasifica esas entradas como temporales, porque no permite saber por qué
fallaron. El formato nuevo distingue errores temporales de permanentes y se
escribe de forma atómica bajo el mismo bloqueo del runtime.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple

from index_lock import index_lock
from runtime_status import atomic_write_json


FAILURE_STATE_VERSION = 2
TEMPORARY = "temporary"
PERMANENT = "permanent"
VALID_KINDS = {TEMPORARY, PERMANENT}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalise_record(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, int) and not isinstance(raw, bool) and raw >= 0:
        # Compatibilidad con failed_files.json plano de versiones anteriores.
        return {
            "attempts": raw,
            "kind": TEMPORARY,
            "last_error": "",
            "updated_at": "",
        }

    if not isinstance(raw, dict):
        raise ValueError("El registro de fallo debe ser un objeto o un entero.")

    attempts = raw.get("attempts", 0)
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts < 0:
        raise ValueError("attempts debe ser un entero no negativo.")
    kind = raw.get("kind", TEMPORARY)
    if kind not in VALID_KINDS:
        raise ValueError("kind debe ser temporary o permanent.")
    last_error = raw.get("last_error", "")
    updated_at = raw.get("updated_at", "")
    return {
        "attempts": attempts,
        "kind": kind,
        "last_error": str(last_error) if last_error is not None else "",
        "updated_at": str(updated_at) if updated_at is not None else "",
    }


def load_failure_records(path: Path) -> Tuple[Dict[str, Dict[str, Any]], bool]:
    """Carga registros normalizados y devuelve si se leyó formato legacy."""
    if not path.exists():
        return {}, False

    try:
        with index_lock(path):
            raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}, False

    legacy = not (
        isinstance(raw, dict)
        and raw.get("version") == FAILURE_STATE_VERSION
        and isinstance(raw.get("files"), dict)
    )
    source = raw.get("files", {}) if not legacy else raw
    records: Dict[str, Dict[str, Any]] = {}
    if not isinstance(source, dict):
        return {}, legacy

    for filename, value in source.items():
        if not isinstance(filename, str) or not filename:
            continue
        try:
            records[filename] = _normalise_record(value)
        except ValueError:
            continue
    return records, legacy


def save_failure_records(path: Path, records: Dict[str, Dict[str, Any]]) -> None:
    """Guarda el estado v2 de forma atómica y con bloqueo compartido."""
    normalised: Dict[str, Dict[str, Any]] = {}
    for filename, value in records.items():
        if not isinstance(filename, str) or not filename:
            continue
        try:
            normalised[filename] = _normalise_record(value)
        except ValueError:
            continue
    payload = {
        "version": FAILURE_STATE_VERSION,
        "files": normalised,
    }
    with index_lock(path):
        atomic_write_json(path, payload)


def update_failure(
    records: Dict[str, Dict[str, Any]],
    filename: str,
    kind: str,
    message: str = "",
) -> Dict[str, Any]:
    """Incrementa y devuelve el registro de un archivo fallido."""
    if kind not in VALID_KINDS:
        raise ValueError("Tipo de fallo no válido.")
    previous = records.get(filename, {})
    if isinstance(previous, dict):
        attempts = previous.get("attempts", 0)
    elif isinstance(previous, int) and not isinstance(previous, bool):
        attempts = previous
    else:
        attempts = 0
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts < 0:
        attempts = 0
    record = {
        "attempts": attempts + 1,
        "kind": kind,
        "last_error": message,
        "updated_at": now_iso(),
    }
    records[filename] = record
    return record


def is_permanent(record: Any) -> bool:
    return isinstance(record, dict) and record.get("kind") == PERMANENT

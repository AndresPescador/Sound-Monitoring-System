"""Snapshots JSON pequeños y atómicos para la interfaz de la estación."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            json.dump(payload, output_file, ensure_ascii=False, indent=2, allow_nan=False)
            output_file.write("\n")
            output_file.flush()
            os.fsync(output_file.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def read_json_snapshot(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError, TypeError):
        return {}


class StatusPublisher:
    def __init__(self, path: Path, component: str, **initial: Any):
        self.path = Path(path)
        self.payload: dict[str, Any] = {
            "component": component,
            "state": "starting",
            "updated_at": utc_now(),
            "last_error": "",
            **initial,
        }

    def publish(self, **changes: Any) -> bool:
        self.payload.update(changes)
        self.payload["updated_at"] = utc_now()
        try:
            atomic_write_json(self.path, self.payload)
            return True
        except (OSError, TypeError, ValueError):
            # La telemetría local nunca debe detener captura, análisis o envío.
            return False

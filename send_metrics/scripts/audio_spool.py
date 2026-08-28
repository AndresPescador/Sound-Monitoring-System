"""Cola recuperable de WAV publicados para el procesador acústico.

Los eventos del sistema de archivos son avisos, no la fuente de verdad. La
reconciliación periódica del directorio garantiza que un evento perdido durante
un arranque, una sobrecarga o un reinicio no deje grabaciones sin procesar.
"""

from __future__ import annotations

import queue
import threading
import time
from pathlib import Path
from typing import Callable, Optional, Union


class AudioSpool:
    """Cola FIFO deduplicada con reintentos diferidos por archivo."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._queue: queue.Queue[Path] = queue.Queue()
        self._tracked: set[Path] = set()
        self._retry_not_before: dict[Path, float] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _normalize(path: Union[Path, str]) -> Path:
        return Path(path).expanduser().absolute()

    def enqueue(self, path: Union[Path, str]) -> bool:
        """Añade un WAV final si no está en cola, procesándose o en backoff."""
        normalized = self._normalize(path)
        if normalized.suffix.lower() != ".wav":
            return False

        with self._lock:
            if normalized in self._tracked:
                return False
            if self._clock() < self._retry_not_before.get(normalized, 0.0):
                return False
            self._tracked.add(normalized)
            self._queue.put(normalized)
        return True

    def reconcile(self, directory: Union[Path, str]) -> int:
        """Encola todos los WAV finales visibles que todavía no estén seguidos."""
        root = Path(directory)
        added = 0
        try:
            candidates = sorted(root.glob("*.wav"))
        except OSError:
            return 0
        for candidate in candidates:
            if self.enqueue(candidate):
                added += 1
        return added

    def get(self, timeout: Optional[float] = None) -> Path:
        return self._queue.get(timeout=timeout)

    def qsize(self) -> int:
        """Estimación suficiente para telemetría; no controla el flujo."""
        return self._queue.qsize()

    def finish(self, path: Union[Path, str], retry_after_seconds: float = 0.0) -> None:
        """Libera un trabajo y, si aplica, impide reencolarlo temporalmente."""
        normalized = self._normalize(path)
        with self._lock:
            self._tracked.discard(normalized)
            if retry_after_seconds > 0:
                self._retry_not_before[normalized] = self._clock() + retry_after_seconds
            else:
                self._retry_not_before.pop(normalized, None)
        self._queue.task_done()

    def discard_missing(self) -> None:
        """Elimina backoffs de archivos que ya no existen."""
        with self._lock:
            stale = [path for path in self._retry_not_before if not path.exists()]
            for path in stale:
                self._retry_not_before.pop(path, None)


def published_wav_from_event(event, *, moved: bool = False) -> Optional[Path]:
    """Obtiene el WAV final de un evento create/move sin depender de watchdog."""
    if getattr(event, "is_directory", False):
        return None
    attribute = "dest_path" if moved else "src_path"
    raw_path = getattr(event, attribute, "")
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.suffix.lower() == ".wav" else None

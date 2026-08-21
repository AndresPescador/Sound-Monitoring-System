"""Bloqueo compartido para las escrituras de index.json.

El productor (process_audio.py) y el consumidor (send_metrics.py) modifican
el mismo archivo. El bloqueo evita que una escritura de uno sobrescriba los
cambios del otro.
"""

from contextlib import contextmanager
import os
from pathlib import Path


if os.name == "nt":
    import msvcrt

    _LOCK_MODE = "windows"
else:
    import fcntl

    _LOCK_MODE = "posix"


@contextmanager
def index_lock(index_path: Path):
    """Adquiere un bloqueo exclusivo asociado al índice indicado."""
    lock_path = index_path.with_name(f"{index_path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with lock_path.open("a+", encoding="utf-8") as lock_file:
        if _LOCK_MODE == "windows":
            lock_file.seek(0)
            lock_file.write("0")
            lock_file.flush()
            lock_file.seek(0)
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
        else:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)

        try:
            yield
        finally:
            if _LOCK_MODE == "windows":
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

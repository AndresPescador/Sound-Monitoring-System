"""Configuración compartida de la estación acústica.

La instalación usa un único TOML para el grabador, el procesador, el emisor y
la TUI. Las variables de entorno y ``send_metrics/.env`` se conservan como
compatibilidad para desarrollo y despliegues existentes.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping, Optional
from urllib.parse import urlparse

try:  # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # Python 3.9/3.10 en Raspberry Pi OS
    import tomli as tomllib


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent


def default_config_path() -> Path:
    override = os.environ.get("SOUND_MONITOR_CONFIG", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "sound-monitor" / "station.toml"


def _resolve_path(value: Any, default: Path, project_dir: Path) -> Path:
    if value in (None, ""):
        return default
    path = Path(str(value)).expanduser()
    return path if path.is_absolute() else project_dir / path


def _integer(value: Any, default: int) -> int:
    if value in (None, ""):
        return default
    return int(value)


@dataclass(frozen=True)
class StationConfig:
    station_code: str = ""
    station_secret: str = ""
    server_url: str = ""
    device: str = ""
    sample_rate: int = 44100
    channels: str = "auto"
    segment_seconds: int = 60
    recordings_dir: Path = Path("/home/pi/grabaciones")
    recorder_state_file: Path = Path("/run/continuous-recorder/state.json")
    runtime_dir: Path = PROJECT_DIR / "runtime"
    metrics_output_dir: Path = PROJECT_DIR / "runtime" / "audio_stats"
    send_interval_seconds: int = 30
    max_retries: int = 3
    max_backlog: int = 100
    token_renewal_margin_seconds: int = 86400
    auth_retry_initial_seconds: int = 30
    auth_retry_max_seconds: int = 900
    log_max_bytes: int = 5 * 1024 * 1024
    log_backup_count: int = 5

    @property
    def is_configured(self) -> bool:
        return bool(
            self.station_code
            and self.station_secret
            and self.server_url
            and self.device
        )

    @property
    def masked_secret(self) -> str:
        if not self.station_secret:
            return "No configurado"
        return "Configurado (oculto)"

    def updated(self, **changes: Any) -> "StationConfig":
        return replace(self, **changes)

    def validate(self, require_identity: bool = True) -> list[str]:
        errors: list[str] = []
        if require_identity:
            if not self.station_code.strip():
                errors.append("El código de estación es obligatorio.")
            if not self.station_secret:
                errors.append("El secreto de estación es obligatorio.")
            if not self.device.strip():
                errors.append("Debe seleccionar un dispositivo ALSA.")

        if self.server_url:
            parsed = urlparse(self.server_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                errors.append("La URL debe comenzar por http:// o https:// e incluir un host.")
            if parsed.username or parsed.password:
                errors.append("La URL no debe contener credenciales.")
        elif require_identity:
            errors.append("La URL del servidor es obligatoria.")

        if self.channels not in {"auto", "mono", "stereo"}:
            errors.append("Los canales deben ser auto, mono o stereo.")
        if not 8000 <= self.sample_rate <= 192000:
            errors.append("La frecuencia debe estar entre 8000 y 192000 Hz.")
        if not 1 <= self.segment_seconds <= 86400:
            errors.append("La duración debe estar entre 1 y 86400 segundos.")
        if self.send_interval_seconds <= 0:
            errors.append("El intervalo de envío debe ser mayor que cero.")
        if self.max_retries <= 0:
            errors.append("El máximo de reintentos debe ser mayor que cero.")
        if self.max_backlog <= 0:
            errors.append("El backlog máximo debe ser mayor que cero.")
        if self.token_renewal_margin_seconds < 0:
            errors.append("El margen de renovación no puede ser negativo.")
        if self.auth_retry_initial_seconds <= 0:
            errors.append("El backoff inicial debe ser mayor que cero.")
        if self.auth_retry_max_seconds < self.auth_retry_initial_seconds:
            errors.append("El backoff máximo debe ser mayor o igual al inicial.")
        if self.log_max_bytes < 1024:
            errors.append("El tamaño de log debe ser de al menos 1024 bytes.")
        if self.log_backup_count < 1:
            errors.append("Debe conservar al menos un log histórico.")
        return errors

    def to_toml(self) -> str:
        def quoted(value: Any) -> str:
            return json.dumps(str(value), ensure_ascii=False)

        values = (
            ("station_code", quoted(self.station_code)),
            ("station_secret", quoted(self.station_secret)),
            ("server_url", quoted(self.server_url.rstrip("/"))),
            ("device", quoted(self.device)),
            ("sample_rate", str(self.sample_rate)),
            ("channels", quoted(self.channels)),
            ("segment_seconds", str(self.segment_seconds)),
            # Claves que consume directamente continuous-recorder.
            ("output_dir", quoted(self.recordings_dir)),
            ("state_file", quoted(self.recorder_state_file)),
            ("runtime_dir", quoted(self.runtime_dir)),
            ("metrics_output_dir", quoted(self.metrics_output_dir)),
            ("send_interval_seconds", str(self.send_interval_seconds)),
            ("max_retries", str(self.max_retries)),
            ("max_backlog", str(self.max_backlog)),
            ("token_renewal_margin_seconds", str(self.token_renewal_margin_seconds)),
            ("auth_retry_initial_seconds", str(self.auth_retry_initial_seconds)),
            ("auth_retry_max_seconds", str(self.auth_retry_max_seconds)),
            ("log_max_bytes", str(self.log_max_bytes)),
            ("log_backup_count", str(self.log_backup_count)),
        )
        header = (
            "# Configuración de Sound Monitor. Generada por la TUI.\n"
            "# Contiene el secreto de estación: conservar permisos 0600.\n"
        )
        return header + "".join(f"{key} = {value}\n" for key, value in values)


def _load_dotenv_compat(project_dir: Path) -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(project_dir / ".env", override=False)


def _data_value(
    data: Optional[Mapping[str, Any]], key: str, env_name: str, default: Any
) -> Any:
    # Las variables de entorno son compatibilidad para instalaciones antiguas
    # y desarrollo sin TOML. Cuando station.toml existe, debe ser la única
    # fuente de configuración para que los tres servicios no diverjan.
    if data is None and env_name in os.environ:
        return os.environ[env_name]
    return data.get(key, default) if data is not None else default


def load_station_config(
    path: Optional[Path] = None,
    *,
    project_dir: Path = PROJECT_DIR,
) -> StationConfig:
    config_path = Path(path) if path is not None else default_config_path()
    data: Optional[Mapping[str, Any]] = None
    if config_path.exists():
        with config_path.open("rb") as input_file:
            loaded = tomllib.load(input_file)
        if not isinstance(loaded, dict):
            raise ValueError("La configuración TOML debe ser un objeto.")
        data = loaded
    else:
        _load_dotenv_compat(project_dir)

    default_runtime = project_dir / "runtime"
    default_recordings = Path.home() / "grabaciones"
    runtime_dir = _resolve_path(
        _data_value(data, "runtime_dir", "RUNTIME_DIR", default_runtime),
        default_runtime,
        project_dir,
    )

    return StationConfig(
        station_code=str(_data_value(data, "station_code", "STATION_CODE", "")).strip(),
        station_secret=str(_data_value(data, "station_secret", "STATION_SECRET", "")),
        server_url=str(_data_value(data, "server_url", "SERVER_URL", "")).rstrip("/"),
        device=str(_data_value(data, "device", "RECORDER_DEVICE", "")).strip(),
        sample_rate=_integer(_data_value(data, "sample_rate", "SAMPLE_RATE", 44100), 44100),
        channels=str(_data_value(data, "channels", "RECORDER_CHANNELS", "auto")),
        segment_seconds=_integer(
            _data_value(data, "segment_seconds", "SEGMENT_SECONDS", 60), 60
        ),
        recordings_dir=_resolve_path(
            _data_value(data, "output_dir", "RECORDINGS_DIR", default_recordings),
            default_recordings,
            project_dir,
        ),
        recorder_state_file=_resolve_path(
            _data_value(
                data,
                "state_file",
                "RECORDER_STATE_FILE",
                Path("/run/continuous-recorder/state.json"),
            ),
            Path("/run/continuous-recorder/state.json"),
            project_dir,
        ),
        runtime_dir=runtime_dir,
        metrics_output_dir=_resolve_path(
            _data_value(
                data,
                "metrics_output_dir",
                "METRICS_OUTPUT_DIR",
                runtime_dir / "audio_stats",
            ),
            runtime_dir / "audio_stats",
            project_dir,
        ),
        send_interval_seconds=_integer(
            _data_value(data, "send_interval_seconds", "SEND_INTERVAL_SECONDS", 30), 30
        ),
        max_retries=_integer(_data_value(data, "max_retries", "MAX_RETRIES", 3), 3),
        max_backlog=_integer(_data_value(data, "max_backlog", "MAX_BACKLOG", 100), 100),
        token_renewal_margin_seconds=_integer(
            _data_value(
                data,
                "token_renewal_margin_seconds",
                "TOKEN_RENEWAL_MARGIN_SECONDS",
                86400,
            ),
            86400,
        ),
        auth_retry_initial_seconds=_integer(
            _data_value(
                data,
                "auth_retry_initial_seconds",
                "AUTH_RETRY_INITIAL_SECONDS",
                30,
            ),
            30,
        ),
        auth_retry_max_seconds=_integer(
            _data_value(data, "auth_retry_max_seconds", "AUTH_RETRY_MAX_SECONDS", 900),
            900,
        ),
        log_max_bytes=max(
            1024,
            _integer(_data_value(data, "log_max_bytes", "LOG_MAX_BYTES", 5 * 1024 * 1024), 5 * 1024 * 1024),
        ),
        log_backup_count=max(
            1,
            _integer(_data_value(data, "log_backup_count", "LOG_BACKUP_COUNT", 5), 5),
        ),
    )


def write_station_config(config: StationConfig, path: Optional[Path] = None) -> Path:
    errors = config.validate(require_identity=True)
    if errors:
        raise ValueError(" ".join(errors))

    config_path = Path(path) if path is not None else default_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(config_path.parent, 0o700)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=config_path.parent,
        prefix=f".{config_path.name}.",
        suffix=".tmp",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            output_file.write(config.to_toml())
            output_file.flush()
            os.fsync(output_file.fileno())
        os.replace(temporary_path, config_path)
        os.chmod(config_path, 0o600)
        directory_descriptor = os.open(config_path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        temporary_path.unlink(missing_ok=True)
    return config_path

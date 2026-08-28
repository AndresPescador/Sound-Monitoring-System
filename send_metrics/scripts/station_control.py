"""Operaciones permitidas para la TUI de Sound Monitor."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

import httpx

from index_lock import index_lock
from runtime_status import atomic_write_json, read_json_snapshot
from station_config import StationConfig


SERVICES = (
    "continuous-recorder.service",
    "process-audio.service",
    "send-metrics.service",
)
SERVICE_ACTIONS = {"start", "stop", "restart"}
SYSTEMCTL = shutil.which("systemctl") or "/usr/bin/systemctl"
SUDO = shutil.which("sudo") or "/usr/bin/sudo"


def service_state(service: str, runner: Callable[..., Any] = subprocess.run) -> str:
    if service not in SERVICES:
        raise ValueError("Servicio no permitido.")
    try:
        result = runner(
            [SYSTEMCTL, "show", "--property=ActiveState", "--value", service],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "desconocido"
    value = result.stdout.strip()
    return value or "desconocido"


def service_states(runner: Callable[..., Any] = subprocess.run) -> dict[str, str]:
    states = {service: "desconocido" for service in SERVICES}
    try:
        result = runner(
            [SYSTEMCTL, "show", "--property=Id", "--property=ActiveState", *SERVICES],
            capture_output=True,
            text=True,
            timeout=6,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return states
    for block in result.stdout.strip().split("\n\n"):
        properties = dict(
            line.split("=", 1)
            for line in block.splitlines()
            if "=" in line
        )
        service = properties.get("Id", "")
        if service in states:
            states[service] = properties.get("ActiveState", "") or "desconocido"
    return states


def control_service(
    service: str,
    action: str,
    runner: Callable[..., Any] = subprocess.run,
) -> tuple[bool, str]:
    if service not in SERVICES or action not in SERVICE_ACTIONS:
        raise ValueError("Acción de servicio no permitida.")
    try:
        result = runner(
            [SUDO, "-n", SYSTEMCTL, action, service],
            capture_output=True,
            text=True,
            timeout=35,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return False, f"No se pudo ejecutar la acción: {error}"
    message = (result.stderr or result.stdout).strip()
    if result.returncode == 0:
        return True, f"{service}: {action} completado."
    return False, message or "La acción fue rechazada; revise los permisos sudoers."


def list_audio_devices(
    binary: str = "continuous-recorder",
    runner: Callable[..., Any] = subprocess.run,
    pactl_binary: Optional[str] = None,
) -> list[dict[str, str]]:
    result = runner(
        [binary, "devices", "--json"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "No se pudieron consultar dispositivos ALSA.")
    value = json.loads(result.stdout)
    if not isinstance(value, list):
        raise RuntimeError("La respuesta de dispositivos ALSA no es válida.")
    devices = [
        {"device": str(item.get("device", "")), "description": str(item.get("description", ""))}
        for item in value
        if isinstance(item, dict) and item.get("device")
    ]
    pulse_source = _default_pulse_source(runner, pactl_binary)
    described = [_describe_audio_device(item, pulse_source) for item in devices]
    priority = {
        "Bluetooth": 0,
        "USB": 1,
        "Jack/analógico": 1,
        "Hardware ALSA": 2,
        "Fuente predeterminada": 2,
        "Predeterminado": 3,
    }
    return sorted(
        described,
        key=lambda item: (
            0 if item.get("is_default") == "true" else priority.get(item.get("connection", ""), 4),
            item.get("display_name", item["device"]).lower(),
        ),
    )


def audio_device_label(device: dict[str, str]) -> str:
    """Etiqueta humana sin perder el identificador que consume ALSA."""
    display_name = device.get("display_name") or device.get("description") or device["device"]
    display_name = " ".join(display_name.split())
    connection = device.get("connection", "ALSA")
    default_suffix = " · predeterminado" if device.get("is_default") == "true" else ""
    return f"{display_name} — {connection}{default_suffix} [{device['device']}]"


def audio_device_details(device: dict[str, str]) -> str:
    return (
        f"Conexión: {device.get('connection', 'ALSA')} · "
        f"Backend: {device.get('backend', 'ALSA')} · Identificador: {device['device']}"
    )


def _default_pulse_source(
    runner: Callable[..., Any],
    pactl_binary: Optional[str],
) -> Optional[dict[str, Any]]:
    pactl = pactl_binary or shutil.which("pactl")
    if not pactl:
        return None
    try:
        default_result = runner(
            [pactl, "get-default-source"],
            capture_output=True,
            text=True,
            timeout=4,
            check=False,
        )
        default_name = default_result.stdout.strip() if default_result.returncode == 0 else ""
        if not default_name:
            info_result = runner(
                [pactl, "info"],
                capture_output=True,
                text=True,
                timeout=4,
                check=False,
            )
            for line in info_result.stdout.splitlines():
                if line.lower().startswith("default source:"):
                    default_name = line.split(":", 1)[1].strip()
                    break
        sources_result = runner(
            [pactl, "--format=json", "list", "sources"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if sources_result.returncode != 0:
            return None
        sources = json.loads(sources_result.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return None
    if not isinstance(sources, list):
        return None
    candidates = [source for source in sources if isinstance(source, dict)]
    for source in candidates:
        if str(source.get("name", "")) == default_name:
            return source
    # Algunos servidores no implementan get-default-source. Solo inferimos el
    # dispositivo cuando existe una única fuente que no es un monitor.
    physical = [source for source in candidates if not str(source.get("name", "")).endswith(".monitor")]
    return physical[0] if len(physical) == 1 else None


def _describe_audio_device(
    device: dict[str, str],
    pulse_source: Optional[dict[str, Any]],
) -> dict[str, str]:
    described = dict(device)
    identifier = described["device"].lower()
    description = described.get("description", "")
    if identifier == "pulse" and pulse_source:
        properties = pulse_source.get("properties", {})
        if not isinstance(properties, dict):
            properties = {}
        display_name = (
            properties.get("bluez5.alias")
            or properties.get("device.description")
            or properties.get("device.product.name")
            or pulse_source.get("description")
            or description
        )
        described.update(
            display_name=str(display_name),
            connection=_pulse_connection(pulse_source),
            backend="PulseAudio/PipeWire",
            source_name=str(pulse_source.get("name", "")),
            is_default="true",
        )
        return described

    text = f"{identifier} {description}".lower()
    if identifier == "pulse":
        connection, backend = "Fuente predeterminada", "PulseAudio/PipeWire"
    elif identifier == "pipewire":
        connection, backend = "Fuente predeterminada", "PipeWire"
    elif identifier == "jack":
        connection, backend = "Virtual", "JACK"
    elif "usb" in text:
        connection, backend = "USB", "ALSA"
    elif identifier.startswith(("hw:", "plughw:")):
        if any(word in text for word in ("analog", "headphone", "headset", "jack")):
            connection = "Jack/analógico"
        else:
            connection = "Hardware ALSA"
        backend = "ALSA"
    elif identifier in {"default", "sysdefault"}:
        connection, backend = "Predeterminado", "ALSA"
    else:
        connection, backend = "Virtual/plugin", "ALSA"
    described.update(display_name=description or device["device"], connection=connection, backend=backend)
    return described


def _pulse_connection(source: dict[str, Any]) -> str:
    properties = source.get("properties", {})
    if not isinstance(properties, dict):
        properties = {}
    active_port = source.get("active_port", {})
    if isinstance(active_port, dict):
        port_text = " ".join(str(value) for value in active_port.values())
    else:
        port_text = str(active_port)
    text = " ".join(
        [
            str(source.get("name", "")),
            str(source.get("description", "")),
            port_text,
            *(f"{key} {value}" for key, value in properties.items()),
        ]
    ).lower()
    if "bluetooth" in text or "bluez" in text:
        return "Bluetooth"
    if str(properties.get("device.bus", "")).lower() == "usb" or " usb" in text:
        return "USB"
    if any(word in text for word in ("analog-input", "headset-mic", "headphone", "jack")):
        return "Jack/analógico"
    if str(source.get("name", "")).endswith(".monitor"):
        return "Virtual/monitor"
    if str(properties.get("device.bus", "")).lower() in {"pci", "platform"}:
        return "Integrado"
    return "Fuente de audio"


def validate_recorder_config(
    config: StationConfig,
    binary: str = "continuous-recorder",
    runner: Callable[..., Any] = subprocess.run,
) -> tuple[bool, str]:
    config.runtime_dir.mkdir(parents=True, exist_ok=True)
    # RuntimeDirectory=/run/continuous-recorder lo crea systemd únicamente al
    # arrancar la unidad. El asistente se ejecuta antes y como usuario sin
    # privilegios, así que la prueba debe usar un state_file temporal escribible.
    validation_state_file = config.runtime_dir / "recorder-validation-state.json"
    validation_config = config.updated(recorder_state_file=validation_state_file)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=config.runtime_dir,
        prefix="recorder-validation-",
        suffix=".toml",
        text=True,
    )
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as output_file:
            output_file.write(validation_config.to_toml())
        try:
            result = runner(
                [binary, "validate-config", "--config", str(temporary_path)],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as error:
            return False, f"No se pudo validar el grabador: {error}"
        message = (result.stdout or result.stderr).strip()
        return result.returncode == 0, message
    finally:
        temporary_path.unlink(missing_ok=True)
        validation_state_file.unlink(missing_ok=True)


def verify_station_credentials(config: StationConfig) -> tuple[bool, str]:
    try:
        response = httpx.post(
            f"{config.server_url.rstrip('/')}/auth/token",
            json={"stationCode": config.station_code, "secret": config.station_secret},
            timeout=10.0,
        )
    except httpx.HTTPError as error:
        return False, f"No se pudo contactar al servidor: {error}"
    if response.status_code == 200:
        return True, "Credenciales verificadas correctamente."
    if response.status_code in {401, 403}:
        return False, "El código o el secreto de estación no son válidos."
    return False, f"El servidor respondió HTTP {response.status_code}."


def queue_summary(config: StationConfig) -> dict[str, Any]:
    index_path = config.metrics_output_dir / "index.json"
    failed_path = config.runtime_dir / "failed_files.json"
    # Los .txt son la fuente de verdad, igual que para send_metrics.py. Leer
    # directamente el índice permitiría que la TUI mostrara una cola vieja si
    # la estación se apaga después de publicar el TXT y antes de actualizar
    # index.json.
    with index_lock(index_path):
        indexed = sorted(path.name for path in config.metrics_output_dir.glob("*.txt"))
        try:
            current_index = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            current_index = []
        if current_index != indexed:
            atomic_write_json(index_path, indexed)
    failed = read_json_snapshot(failed_path)
    exhausted = sorted(
        name for name, count in failed.items()
        if name in indexed
        and isinstance(count, int)
        and count >= config.max_retries
    )
    return {
        "total": len(indexed),
        "pending": sum(1 for name in indexed if name not in exhausted),
        "exhausted": len(exhausted),
        "exhausted_files": exhausted,
    }


def reactivate_exhausted(config: StationConfig) -> int:
    failed_path = config.runtime_dir / "failed_files.json"
    with index_lock(failed_path):
        failed = read_json_snapshot(failed_path)
        retained = {
            name: count
            for name, count in failed.items()
            if not isinstance(count, int) or count < config.max_retries
        }
        removed = len(failed) - len(retained)
        atomic_write_json(failed_path, retained)
    return removed


def read_recent_events(config: StationConfig, limit: int = 12) -> list[str]:
    lines: list[str] = []
    for path in (
        config.runtime_dir / "audio_processing_log.log",
        config.runtime_dir / "send_metrics.log",
    ):
        lines.extend(_tail_lines(path, limit))
    lines = sorted(lines)[-limit:]
    return [sanitize_event(line, config.station_secret) for line in lines]


def _tail_lines(path: Path, limit: int, max_bytes: int = 65536) -> list[str]:
    try:
        with path.open("rb") as input_file:
            input_file.seek(0, os.SEEK_END)
            size = input_file.tell()
            input_file.seek(max(0, size - max_bytes))
            data = input_file.read()
    except OSError:
        return []
    text = data.decode("utf-8", errors="replace")
    lines = text.splitlines()
    if size > max_bytes and lines:
        lines = lines[1:]
    return lines[-limit:]


def sanitize_event(message: str, secret: str = "") -> str:
    sanitized = message.replace(secret, "[SECRETO]" ) if secret else message
    sanitized = re.sub(r"Bearer\s+[A-Za-z0-9._~-]+", "Bearer [TOKEN]", sanitized)
    sanitized = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[TOKEN]", sanitized)
    return sanitized

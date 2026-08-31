#!/usr/bin/env python3
"""TUI de operación y configuración de la estación acústica."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

from textual import work
from textual.app import App, ComposeResult
from textual.containers import Grid, Horizontal, Vertical, VerticalScroll
from textual.screen import ModalScreen, Screen
from textual.widgets import (
    Button,
    Footer,
    Header,
    Input,
    Label,
    ProgressBar,
    RichLog,
    Select,
    Static,
    TabbedContent,
    TabPane,
)


PROJECT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = PROJECT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from runtime_status import read_json_snapshot  # noqa: E402
from station_config import (  # noqa: E402
    StationConfig,
    default_config_path,
    load_station_config,
    write_station_config,
)
from station_control import (  # noqa: E402
    SERVICES,
    audio_device_details,
    audio_device_label,
    control_service,
    list_audio_devices,
    queue_summary,
    reactivate_exhausted,
    read_recent_events,
    service_state,
    service_states,
    validate_recorder_config,
    verify_station_credentials,
)


SERVICE_LABELS = {
    "continuous-recorder.service": "Grabador",
    "process-audio.service": "Procesador",
    "send-metrics.service": "Emisor",
}


class ConfirmScreen(ModalScreen[bool]):
    """Confirmación de una acción que interrumpe o reintenta trabajo."""

    DEFAULT_CSS = """
    ConfirmScreen { align: center middle; background: rgba(2, 6, 23, 0.78); }
    ConfirmScreen > Vertical { width: 64; height: auto; padding: 1 2; background: #0e1223; border: solid #475569; }
    ConfirmScreen #confirm-message { margin-bottom: 1; color: #f8fafc; }
    ConfirmScreen Horizontal { height: auto; align-horizontal: right; }
    ConfirmScreen Button { margin-left: 1; }
    """

    def __init__(self, title: str, message: str):
        super().__init__()
        self.title_text = title
        self.message = message

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"[b]{self.title_text}[/b]")
            yield Static(self.message, id="confirm-message")
            with Horizontal():
                yield Button("Cancelar", id="cancel")
                yield Button("Confirmar", variant="error", id="confirm")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss(event.button.id == "confirm")


class InfoScreen(ModalScreen[None]):
    DEFAULT_CSS = """
    InfoScreen { align: center middle; background: rgba(2, 6, 23, 0.78); }
    InfoScreen > Vertical { width: 82; height: 28; padding: 1 2; background: #0e1223; border: solid #475569; }
    InfoScreen RichLog { height: 1fr; border: solid #334155; margin: 1 0; }
    """

    def __init__(self, title: str, lines: Iterable[str]):
        super().__init__()
        self.title_text = title
        self.lines = list(lines)

    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label(f"[b]{self.title_text}[/b]")
            yield RichLog(id="info-log", wrap=True, markup=False)
            yield Button("Cerrar", id="close", variant="primary")

    def on_mount(self) -> None:
        log = self.query_one("#info-log", RichLog)
        for line in self.lines or ["No hay información disponible."]:
            log.write(line)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "close":
            self.dismiss(None)


class ConfigurationScreen(Screen[Optional[set[str]]]):
    """Asistente inicial y editor de configuración avanzada."""

    DEFAULT_CSS = """
    ConfigurationScreen { background: #020617; color: #f8fafc; }
    ConfigurationScreen #settings-title { height: 3; padding: 1 2; background: #0f172a; color: #f8fafc; text-style: bold; }
    ConfigurationScreen VerticalScroll { padding: 1 3; }
    ConfigurationScreen .section { margin-top: 1; color: #5eead4; text-style: bold; }
    ConfigurationScreen .hint { color: #94a3b8; margin-bottom: 1; }
    ConfigurationScreen Input, ConfigurationScreen Select { margin-bottom: 1; }
    ConfigurationScreen #device-details { color: #cbd5e1; margin-bottom: 1; }
    ConfigurationScreen #settings-error { min-height: 2; color: #f87171; margin: 1 0; }
    ConfigurationScreen #settings-actions { height: auto; align-horizontal: right; margin-top: 1; }
    ConfigurationScreen Button { margin-left: 1; }
    """

    def __init__(self, config: StationConfig, config_path: Path, initial: bool = False):
        super().__init__()
        self.config = config
        self.config_path = config_path
        self.initial = initial
        self.devices: list[dict[str, str]] = []
        self.device_error = ""
        try:
            self.devices = list_audio_devices()
        except Exception as error:  # El formulario sigue disponible para corrección manual.
            self.device_error = str(error)

    def compose(self) -> ComposeResult:
        title = "Configuración inicial de Sound Monitor" if self.initial else "Configuración de Sound Monitor"
        yield Label(title, id="settings-title")
        with VerticalScroll():
            yield Label("Identidad y servidor", classes="section")
            yield Label(
                "El secreto se guarda con permisos 0600. Cambiar identidad o URL invalida el token local y reinicia el emisor.",
                classes="hint",
            )
            yield Label("Código de estación")
            yield Input(value=self.config.station_code, id="station-code")
            yield Label("Secreto de estación")
            yield Input(
                value="",
                placeholder="Obligatorio" if not self.config.station_secret else "Dejar vacío para conservar",
                password=True,
                id="station-secret",
            )
            yield Label("URL del sistema")
            yield Input(value=self.config.server_url, placeholder="https://servidor.example", id="server-url")

            yield Label("Captura", classes="section")
            yield Label(
                "Cambiar estos valores valida ALSA y reinicia el grabador, publicando antes el segmento parcial.",
                classes="hint",
            )
            device_options = [
                (audio_device_label(item), item["device"])
                for item in self.devices
            ]
            if self.config.device and self.config.device not in {value for _, value in device_options}:
                device_options.insert(0, (self.config.device, self.config.device))
            if not device_options:
                device_options = [("No se detectaron dispositivos; use la entrada manual", "")]
            yield Label("Dispositivo ALSA")
            if self.config.device:
                yield Select(
                    device_options,
                    value=self.config.device,
                    allow_blank=True,
                    id="device",
                )
            else:
                # No pasar Select.BLANK explícitamente: en Textual 8.2 su
                # valor interno es False y algunas versiones lo validan como
                # una opción normal durante mount, provocando un traceback.
                yield Select(device_options, allow_blank=True, id="device")
            selected_info = next(
                (item for item in self.devices if item["device"] == self.config.device),
                None,
            )
            yield Static(
                audio_device_details(selected_info)
                if selected_info
                else "Seleccione un dispositivo para ver su conexión y backend.",
                id="device-details",
            )
            yield Label("Dispositivo ALSA manual (opcional)")
            yield Input(
                value="",
                placeholder="Ej.: default, pipewire, hw:1,0",
                id="device-manual",
            )
            yield Label(
                "La entrada manual tiene prioridad sobre el selector y permite usar dispositivos virtuales o Bluetooth.",
                classes="hint",
            )
            if self.device_error:
                yield Label(f"Detección ALSA: {self.device_error}", classes="hint")
            yield Label("Duración de cada segmento (segundos)")
            yield Input(value=str(self.config.segment_seconds), type="integer", id="segment-seconds")
            yield Label("Frecuencia de muestreo (Hz)")
            yield Input(value=str(self.config.sample_rate), type="integer", id="sample-rate")
            yield Label("Canales")
            yield Select(
                [("Automático", "auto"), ("Mono", "mono"), ("Estéreo obligatorio", "stereo")],
                value=self.config.channels,
                id="channels",
            )

            yield Label("Envío avanzado", classes="section")
            yield Label("Estos valores ya tienen perfiles seguros para una Raspberry.", classes="hint")
            with Grid(id="advanced-grid"):
                yield Label("Intervalo de envío (s)")
                yield Input(value=str(self.config.send_interval_seconds), type="integer", id="send-interval")
                yield Label("Umbral de alerta (reintentos)")
                yield Input(value=str(self.config.max_retries), type="integer", id="max-retries")
                yield Label("Backlog por ciclo")
                yield Input(value=str(self.config.max_backlog), type="integer", id="max-backlog")
                yield Label("Margen renovación token (s)")
                yield Input(value=str(self.config.token_renewal_margin_seconds), type="integer", id="token-margin")
                yield Label("Backoff inicial (s)")
                yield Input(value=str(self.config.auth_retry_initial_seconds), type="integer", id="auth-initial")
                yield Label("Backoff máximo (s)")
                yield Input(value=str(self.config.auth_retry_max_seconds), type="integer", id="auth-max")
                yield Label("Tamaño máximo de log (bytes)")
                yield Input(value=str(self.config.log_max_bytes), type="integer", id="log-bytes")
                yield Label("Logs históricos")
                yield Input(value=str(self.config.log_backup_count), type="integer", id="log-backups")

            yield Static("", id="settings-error")
            with Horizontal(id="settings-actions"):
                if not self.initial:
                    yield Button("Cancelar", id="cancel")
                yield Button("Guardar, validar y aplicar", id="save", variant="success")

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id != "device" or not self.is_mounted:
            return
        selected = next(
            (item for item in self.devices if item["device"] == event.value),
            None,
        )
        details = self.query_one("#device-details", Static)
        details.update(
            audio_device_details(selected)
            if selected
            else "Dispositivo manual o no identificado por el servidor de audio."
        )

    def _input_int(self, selector: str) -> int:
        value = self.query_one(selector, Input).value.strip()
        return int(value)

    def _candidate(self) -> StationConfig:
        secret_value = self.query_one("#station-secret", Input).value
        selected_device = self.query_one("#device", Select).value
        manual_device = self.query_one("#device-manual", Input).value.strip()
        selected_channels = self.query_one("#channels", Select).value
        no_selected_device = (
            selected_device is Select.BLANK or selected_device is Select.NULL
        )
        return self.config.updated(
            station_code=self.query_one("#station-code", Input).value.strip(),
            station_secret=secret_value or self.config.station_secret,
            server_url=self.query_one("#server-url", Input).value.strip().rstrip("/"),
            device=manual_device or ("" if no_selected_device else str(selected_device)),
            segment_seconds=self._input_int("#segment-seconds"),
            sample_rate=self._input_int("#sample-rate"),
            channels=str(selected_channels),
            send_interval_seconds=self._input_int("#send-interval"),
            max_retries=self._input_int("#max-retries"),
            max_backlog=self._input_int("#max-backlog"),
            token_renewal_margin_seconds=self._input_int("#token-margin"),
            auth_retry_initial_seconds=self._input_int("#auth-initial"),
            auth_retry_max_seconds=self._input_int("#auth-max"),
            log_max_bytes=self._input_int("#log-bytes"),
            log_backup_count=self._input_int("#log-backups"),
        )

    @staticmethod
    def _validate_capture_change(candidate: StationConfig, initial: bool):
        """Prueba ALSA sin competir con el grabador que usa el dispositivo."""
        recorder_was_stopped = False
        if not initial and service_state("continuous-recorder.service") == "active":
            stopped, message = control_service("continuous-recorder.service", "stop")
            if not stopped:
                return False, f"No se pudo detener el grabador para validar: {message}", False
            recorder_was_stopped = True
        try:
            recorder_ok, recorder_message = validate_recorder_config(candidate)
        except Exception as error:
            recorder_ok, recorder_message = False, f"La validación falló: {error}"
        return recorder_ok, recorder_message, recorder_was_stopped

    @staticmethod
    def _restore_recorder_if_needed(recorder_was_stopped: bool) -> str:
        if not recorder_was_stopped:
            return ""
        started, message = control_service("continuous-recorder.service", "start")
        return "" if started else f"No se pudo restaurar el grabador: {message}"

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cancel":
            self.dismiss(None)
            return
        if event.button.id != "save":
            return

        error_label = self.query_one("#settings-error", Static)
        save_button = self.query_one("#save", Button)
        try:
            candidate = self._candidate()
        except ValueError:
            error_label.update("Todos los valores numéricos deben contener enteros válidos.")
            return

        errors = candidate.validate(require_identity=True)
        if errors:
            error_label.update("\n".join(f"• {error}" for error in errors))
            return

        capture_fields = {"device", "sample_rate", "channels", "segment_seconds"}
        identity_fields = {"station_code", "station_secret", "server_url"}
        sender_fields = {
            *identity_fields,
            "send_interval_seconds", "max_retries", "max_backlog",
            "token_renewal_margin_seconds", "auth_retry_initial_seconds",
            "auth_retry_max_seconds", "log_max_bytes", "log_backup_count",
        }
        changed = {
            field
            for field in capture_fields | sender_fields
            if getattr(candidate, field) != getattr(self.config, field)
        }
        save_button.disabled = True
        error_label.update("Validando los cambios…")
        recorder_result, credential_result = await asyncio.gather(
            asyncio.to_thread(self._validate_capture_change, candidate, self.initial)
            if self.initial or changed & capture_fields
            else asyncio.sleep(0, result=(True, "Sin cambios de captura.", False)),
            asyncio.to_thread(verify_station_credentials, candidate)
            if self.initial or changed & identity_fields
            else asyncio.sleep(0, result=(True, "Sin cambios de identidad.")),
        )
        recorder_ok, recorder_message, recorder_was_stopped = recorder_result
        credentials_ok, credentials_message = credential_result
        if not recorder_ok or not credentials_ok:
            restore_error = await asyncio.to_thread(
                self._restore_recorder_if_needed,
                recorder_was_stopped,
            )
            messages = []
            if not recorder_ok:
                messages.append(f"Grabador: {recorder_message}")
            if not credentials_ok:
                messages.append(f"Servidor: {credentials_message}")
            if restore_error:
                messages.append(restore_error)
            error_label.update("\n".join(messages))
            save_button.disabled = False
            return

        try:
            write_station_config(candidate, self.config_path)
        except (OSError, ValueError) as error:
            restore_error = await asyncio.to_thread(
                self._restore_recorder_if_needed,
                recorder_was_stopped,
            )
            message = f"No se pudo guardar: {error}"
            if restore_error:
                message += f"\n{restore_error}"
            error_label.update(message)
            save_button.disabled = False
            return
        self.dismiss(changed)


class SoundMonitorApp(App[bool]):
    """Panel de operación local; no participa en la captura ni en el envío."""

    TITLE = "Sound Monitor"
    SUB_TITLE = "Estación acústica"
    ENABLE_COMMAND_PALETTE = False

    CSS = """
    Screen { background: #020617; color: #f8fafc; }
    Header { background: #0f172a; color: #f8fafc; }
    Footer { background: #0f172a; color: #cbd5e1; }
    TabbedContent { height: 1fr; }
    TabPane { padding: 1 2; }
    #overview-grid { grid-size: 3 1; grid-columns: 1fr 1fr 1fr; grid-gutter: 1; height: 11; }
    .card { border: solid #334155; background: #0e1223; padding: 1 2; height: 11; }
    .card-title { color: #5eead4; text-style: bold; }
    #segment-progress { margin: 1 0; }
    #summary-line { height: 3; border: solid #334155; padding: 0 1; background: #0e1223; }
    #events { border: solid #334155; background: #0e1223; height: 1fr; margin-top: 1; }
    #controls-grid { grid-size: 3 4; grid-columns: 1fr 1fr 1fr; grid-gutter: 1; height: auto; }
    #controls-grid Button { width: 100%; }
    .section-title { color: #5eead4; text-style: bold; margin: 1 0; }
    #config-summary, #diagnostic-result { border: solid #334155; padding: 1 2; background: #0e1223; }
    #config-actions { height: auto; margin-top: 1; }
    #config-actions Button { margin-right: 1; }
    Button:focus, Input:focus, Select:focus { border: tall #f8fafc; }
    """

    BINDINGS = [
        ("r", "refresh", "Actualizar"),
        ("c", "configure", "Configuración"),
        ("d", "devices", "Dispositivos"),
        ("q", "quit", "Salir"),
    ]

    def __init__(self, config_path: Path, setup_only: bool = False):
        super().__init__()
        self.config_path = config_path
        self.startup_error = ""
        try:
            self.config = load_station_config(config_path, project_dir=PROJECT_DIR)
        except (OSError, ValueError) as error:
            self.startup_error = f"No se pudo leer la configuración; puede corregirla desde el asistente: {error}"
            runtime_dir = PROJECT_DIR / "runtime"
            self.config = StationConfig(
                recordings_dir=Path.home() / "grabaciones",
                runtime_dir=runtime_dir,
                metrics_output_dir=runtime_dir / "audio_stats",
            )
        self.setup_only = setup_only

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(initial="overview"):
            with TabPane("Resumen", id="overview"):
                with Grid(id="overview-grid"):
                    yield Static(id="recorder-card", classes="card")
                    yield Static(id="processor-card", classes="card")
                    yield Static(id="sender-card", classes="card")
                yield ProgressBar(total=100, show_eta=False, id="segment-progress")
                yield Static("Cargando estado…", id="summary-line")
                yield RichLog(id="events", wrap=True, markup=False, max_lines=100)
            with TabPane("Controles", id="controls"):
                yield Label("Servicios", classes="section-title")
                with Grid(id="controls-grid"):
                    for service, prefix in (
                        ("continuous-recorder.service", "recorder"),
                        ("process-audio.service", "processor"),
                        ("send-metrics.service", "sender"),
                    ):
                        yield Button(f"Iniciar {SERVICE_LABELS[service]}", id=f"start-{prefix}", variant="success")
                        yield Button(f"Reiniciar {SERVICE_LABELS[service]}", id=f"restart-{prefix}", variant="warning")
                        yield Button(f"Detener {SERVICE_LABELS[service]}", id=f"stop-{prefix}", variant="error")
                    yield Button("Iniciar toda la estación", id="start-all", variant="success")
                    yield Button("Reiniciar toda la estación", id="restart-all", variant="warning")
                    yield Button("Detener toda la estación", id="stop-all", variant="error")
                yield Label("Cola y diagnóstico", classes="section-title")
                with Horizontal():
                    yield Button("Reactivar fallidos", id="retry-failed")
                    yield Button("Probar estación", id="diagnose", variant="primary")
                    yield Button("Ver dispositivos ALSA", id="devices")
                yield Static("", id="diagnostic-result")
            with TabPane("Configuración", id="configuration"):
                yield Static(id="config-summary")
                with Horizontal(id="config-actions"):
                    yield Button("Editar configuración", id="edit-config", variant="primary")
                    yield Button("Probar estación", id="diagnose-config")
        yield Footer()

    def on_mount(self) -> None:
        self.set_interval(2.0, self.action_refresh)
        if self.startup_error:
            self.notify(self.startup_error, severity="error", timeout=10)
        if not self.config.is_configured or self.setup_only:
            self.push_screen(
                ConfigurationScreen(self.config, self.config_path, initial=not self.config.is_configured),
                self._configuration_finished,
            )
        self.action_refresh()

    def action_refresh(self) -> None:
        self._collect_status()

    @work(thread=True, exclusive=True, group="status")
    def _collect_status(self) -> None:
        try:
            config = load_station_config(self.config_path, project_dir=PROJECT_DIR)
        except (OSError, ValueError):
            config = self.config
        recorder = read_json_snapshot(config.recorder_state_file)
        processor = read_json_snapshot(config.runtime_dir / "processor_status.json")
        sender = read_json_snapshot(config.runtime_dir / "sender_status.json")
        try:
            queue = queue_summary(config)
        except (OSError, ValueError):
            queue = {
                "total": 0,
                "pending": 0,
                "exhausted": 0,
                "exhausted_files": [],
                "temporary_failures": 0,
                "permanent_failures": 0,
                "retry_alerts": 0,
            }
        try:
            disk = shutil.disk_usage(config.recordings_dir)
            free_gib = disk.free / (1024 ** 3)
        except OSError:
            free_gib = 0.0
        services = service_states()
        events = read_recent_events(config)
        self.call_from_thread(
            self._apply_status,
            config,
            recorder,
            processor,
            sender,
            queue,
            free_gib,
            services,
            events,
        )

    def _apply_status(
        self,
        config: StationConfig,
        recorder: dict[str, Any],
        processor: dict[str, Any],
        sender: dict[str, Any],
        queue: dict[str, Any],
        free_gib: float,
        services: dict[str, str],
        events: list[str],
    ) -> None:
        self.config = config
        rec_state = recorder.get("state", "sin estado")
        rec_service = services.get("continuous-recorder.service", "desconocido")
        frames = int(recorder.get("frames_in_segment", 0) or 0)
        actual_rate = int(recorder.get("sample_rate", 0) or config.sample_rate)
        elapsed = frames / actual_rate if actual_rate else 0
        progress = min(100.0, elapsed * 100 / config.segment_seconds) if config.segment_seconds else 0
        remaining = max(0, config.segment_seconds - elapsed)
        self.query_one("#segment-progress", ProgressBar).update(progress=progress)
        self.query_one("#recorder-card", Static).update(
            "[bold #5eead4]GRABACIÓN[/]\n"
            f"Estado: [b]{rec_state}[/b] ({rec_service})\n"
            f"Segmento: {elapsed:05.1f}s / {config.segment_seconds}s\n"
            f"Restante: {remaining:05.1f}s\n"
            f"Formato: {recorder.get('sample_rate', config.sample_rate)} Hz · "
            f"{recorder.get('channels', config.channels)} canal(es) · 24 bit\n"
            f"Dispositivo: {recorder.get('device', config.device) or 'no configurado'}"
        )
        self.query_one("#processor-card", Static).update(
            "[bold #5eead4]ANÁLISIS[/]\n"
            f"Estado: [b]{processor.get('state', 'sin estado')}[/b] "
            f"({services.get('process-audio.service', 'desconocido')})\n"
            f"Actual: {processor.get('current_file') or '—'}\n"
            f"Último: {processor.get('last_processed_file') or '—'}\n"
            f"Procesados: {processor.get('processed_count', 0)}\n"
            f"Errores: {processor.get('failed_count', 0)} · "
            f"Cuarentena: {processor.get('quarantined_count', 0)}"
        )
        self.query_one("#sender-card", Static).update(
            "[bold #5eead4]ENVÍO[/]\n"
            f"Estado: [b]{sender.get('state', 'sin estado')}[/b] "
            f"({services.get('send-metrics.service', 'desconocido')})\n"
            f"Pendientes/recuperables: {queue.get('pending', 0)}\n"
            f"Reintentos temporales: {queue.get('temporary_failures', sender.get('temporary_failures', 0))} "
            f"(alertas: {queue.get('retry_alerts', sender.get('retry_alerts', 0))})\n"
            f"Pausados permanentes: {queue.get('permanent_failures', queue.get('exhausted', 0))}\n"
            f"Conectividad: {sender.get('transport_state', 'desconocida')}\n"
            f"Próximo intento: {sender.get('next_retry_at') or '—'}\n"
            f"Último error: {sender.get('last_error') or '—'}\n"
            f"Último: {sender.get('last_sent_file') or '—'}\n"
            f"Resultado: {sender.get('last_outcome') or '—'}"
        )
        sender_state = sender.get("state")
        component_states_ok = (
            rec_state == "recording"
            and processor.get("state") in {"watching", "processing"}
            and sender_state in {"idle", "sending", "waiting"}
        )
        core_health_ok = (
            all(value == "active" for value in services.values())
            and component_states_ok
            and free_gib >= 1.0
            and not processor.get("last_error")
        )
        transport_state = sender.get("transport_state", "unknown")
        health = (
            "REVISAR"
            if not core_health_ok
            else "SIN CONEXIÓN"
            if transport_state == "offline"
            else "OPERATIVA"
        )
        self.query_one("#summary-line", Static).update(
            f"Estación {config.station_code or 'sin configurar'} · Salud: {health} · "
            f"Disco libre: {free_gib:.1f} GiB · Cola total: {queue['total']}"
        )
        self.query_one("#config-summary", Static).update(
            "[b]Configuración activa[/b]\n\n"
            f"Estación: {config.station_code or 'No configurada'}\n"
            f"Secreto: {config.masked_secret}\n"
            f"Servidor: {config.server_url or 'No configurado'}\n"
            f"Audio: {config.device or 'No configurado'} · {config.sample_rate} Hz · "
            f"{config.channels} · {config.segment_seconds}s\n"
            f"Envío: cada {config.send_interval_seconds}s · umbral de alerta "
            f"{config.max_retries} reintentos · "
            f"backlog {config.max_backlog}\n"
            f"Archivo: {self.config_path}"
        )
        event_log = self.query_one("#events", RichLog)
        event_log.clear()
        for line in events or ["Sin eventos recientes."]:
            event_log.write(line)

    def action_configure(self) -> None:
        self.push_screen(ConfigurationScreen(self.config, self.config_path), self._configuration_finished)

    def action_devices(self) -> None:
        self._show_devices()

    @work(thread=True, exclusive=True, group="devices")
    def _show_devices(self) -> None:
        try:
            devices = list_audio_devices()
            lines = [
                f"{audio_device_label(item)}\n{audio_device_details(item)}\n{item['description']}"
                for item in devices
            ]
        except Exception as error:
            lines = [str(error)]
        self.call_from_thread(self.push_screen, InfoScreen("Dispositivos ALSA", lines))

    def _configuration_finished(self, changed: Optional[set[str]]) -> None:
        if changed is None:
            if self.setup_only and not self.config.is_configured:
                self.exit(False)
            return
        previous = self.config
        self.config = load_station_config(self.config_path, project_dir=PROJECT_DIR)
        identity_fields = {"station_code", "station_secret", "server_url"}
        capture_fields = {"device", "sample_rate", "channels", "segment_seconds"}
        logging_fields = {"log_max_bytes", "log_backup_count"}
        if changed & identity_fields:
            try:
                (previous.runtime_dir / "token.json").unlink(missing_ok=True)
            except OSError as error:
                self.notify(f"No se pudo invalidar el token local: {error}", severity="warning")
        if self.setup_only:
            self.exit(True)
            return
        if changed & capture_fields:
            self._run_service_action("continuous-recorder.service", "restart")
        if changed & logging_fields:
            self._run_service_action("process-audio.service", "restart")
        if changed - capture_fields:
            self._run_service_action("send-metrics.service", "restart")
        self.notify("Configuración guardada y validada.", severity="information")
        self.action_refresh()

    def _service_from_button(self, button_id: str) -> Optional[tuple[str, str]]:
        prefixes = {
            "recorder": "continuous-recorder.service",
            "processor": "process-audio.service",
            "sender": "send-metrics.service",
        }
        for action in ("start", "restart", "stop"):
            if button_id.startswith(f"{action}-"):
                suffix = button_id.removeprefix(f"{action}-")
                if suffix in prefixes:
                    return prefixes[suffix], action
        return None

    def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""
        mapped = self._service_from_button(button_id)
        if mapped:
            service, action = mapped
            self._confirm_or_run(service, action)
        elif button_id in {"start-all", "restart-all", "stop-all"}:
            action = button_id.split("-", 1)[0]
            self._confirm_or_run("all", action)
        elif button_id in {"edit-config"}:
            self.action_configure()
        elif button_id in {"devices"}:
            self.action_devices()
        elif button_id in {"diagnose", "diagnose-config"}:
            self._diagnose()
        elif button_id == "retry-failed":
            self.push_screen(
                ConfirmScreen(
                    "Reactivar archivos fallidos",
                    "Solo los archivos pausados por errores permanentes volverán a enviarse. "
                    "Los fallos temporales ya se reintentan automáticamente.",
                ),
                lambda confirmed: self._retry_failed() if confirmed else None,
            )

    def _confirm_or_run(self, service: str, action: str) -> None:
        if action == "start":
            self._run_service_action(service, action)
            return
        target = "toda la estación" if service == "all" else SERVICE_LABELS[service]
        warning = "Detener el grabador cerrará y publicará el segmento parcial actual."
        self.push_screen(
            ConfirmScreen(f"{action.capitalize()} {target}", warning),
            lambda confirmed: self._run_service_action(service, action) if confirmed else None,
        )

    @work(thread=True, group="service-actions")
    def _run_service_action(self, service: str, action: str) -> None:
        targets = list(SERVICES) if service == "all" else [service]
        messages = []
        ok = True
        for target in targets:
            target_ok, message = control_service(target, action)
            ok = ok and target_ok
            messages.append(message)
        self.call_from_thread(
            self.notify,
            " ".join(messages),
            severity="information" if ok else "error",
            timeout=8,
        )
        self.call_from_thread(self.action_refresh)

    @work(thread=True, exclusive=True, group="diagnostic")
    def _diagnose(self) -> None:
        recorder_ok, recorder_message = validate_recorder_config(self.config)
        credentials_ok, credentials_message = verify_station_credentials(self.config)
        message = (
            f"Grabador: {'OK' if recorder_ok else 'ERROR'} — {recorder_message}\n"
            f"Servidor: {'OK' if credentials_ok else 'ERROR'} — {credentials_message}"
        )
        self.call_from_thread(self.query_one("#diagnostic-result", Static).update, message)

    @work(thread=True, exclusive=True, group="retry")
    def _retry_failed(self) -> None:
        stopped, stop_message = control_service("send-metrics.service", "stop")
        if not stopped:
            self.call_from_thread(self.notify, stop_message, severity="error")
            return
        try:
            count = reactivate_exhausted(self.config)
        finally:
            started, start_message = control_service("send-metrics.service", "start")
        severity = "information" if started else "error"
        self.call_from_thread(
            self.notify,
            f"Se reactivaron {count} archivo(s). {start_message}",
            severity=severity,
        )
        self.call_from_thread(self.action_refresh)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Interfaz de la estación Sound Monitor")
    parser.add_argument("--setup", action="store_true", help="Ejecutar únicamente el asistente inicial")
    parser.add_argument("--config", type=Path, default=default_config_path())
    args = parser.parse_args(argv)
    result = SoundMonitorApp(args.config, setup_only=args.setup).run()
    return 0 if result is not False else 2


if __name__ == "__main__":
    raise SystemExit(main())

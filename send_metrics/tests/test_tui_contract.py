import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import call, patch


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(PROJECT_DIR))

import textual  # noqa: F401


class TuiContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_desktop_autostart_recovers_only_inactive_services(self):
        from station_config import StationConfig, write_station_config
        from tui.app import SoundMonitorApp

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "station.toml"
            write_station_config(
                StationConfig(
                    station_code="ST-TEST",
                    station_secret="secret",
                    server_url="https://monitor.example",
                    device="hw:1,0",
                    recordings_dir=root / "recordings",
                    recorder_state_file=root / "recorder.json",
                    runtime_dir=root / "runtime",
                    metrics_output_dir=root / "runtime" / "audio_stats",
                ),
                config_path,
            )
            with (
                patch.object(SoundMonitorApp, "_collect_status", lambda _self: None),
                patch(
                    "tui.app.service_states",
                    return_value={
                        "continuous-recorder.service": "active",
                        "process-audio.service": "inactive",
                        "send-metrics.service": "failed",
                    },
                ),
                patch("tui.app.control_service", return_value=(True, "OK")) as control,
            ):
                app = SoundMonitorApp(config_path, auto_start=True)
                async with app.run_test(size=(120, 40)) as pilot:
                    await pilot.pause()
                    await pilot.pause()

            self.assertEqual(
                control.call_args_list,
                [
                    call("process-audio.service", "start"),
                    call("send-metrics.service", "start"),
                ],
            )

    def test_manual_or_setup_launch_never_enables_autostart_recovery(self):
        from tui.app import SoundMonitorApp, main

        with patch("tui.app.SoundMonitorApp") as app_class:
            app_class.return_value.run.return_value = True

            self.assertEqual(main([]), 0)
            self.assertFalse(app_class.call_args.kwargs["auto_start"])

            self.assertEqual(main(["--setup", "--autostart"]), 0)
            self.assertTrue(app_class.call_args.kwargs["setup_only"])
            self.assertFalse(app_class.call_args.kwargs["auto_start"])

        message = SoundMonitorApp._diagnostic_message(
            True,
            "OK",
            False,
            "Auth no responde",
            {
                "continuous-recorder.service": "enabled",
                "process-audio.service": "disabled",
                "send-metrics.service": "unknown",
            },
        )
        self.assertIn("Grabador: habilitado", message)
        self.assertIn("Procesador: deshabilitado", message)
        self.assertIn("Emisor: desconocido", message)

    async def test_first_run_without_alsa_devices_mounts_and_accepts_manual_device(self):
        from textual.widgets import Input, Select
        from tui.app import ConfigurationScreen, SoundMonitorApp

        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "station.toml"
            config_path.write_text("# configuración inicial vacía\n", encoding="utf-8")
            with (
                patch.object(SoundMonitorApp, "_collect_status", lambda _self: None),
                patch("tui.app.list_audio_devices", return_value=[]),
            ):
                app = SoundMonitorApp(config_path)
                async with app.run_test(size=(120, 40)) as pilot:
                    await pilot.pause()
                    self.assertIsInstance(app.screen, ConfigurationScreen)
                    self.assertIs(app.screen.query_one("#device", Select).value, Select.NULL)
                    app.screen.query_one("#device-manual", Input).value = "default"
                    self.assertEqual(app.screen._candidate().device, "default")

    def test_capture_validation_stops_exclusive_recorder_first(self):
        from station_config import StationConfig
        from tui.app import ConfigurationScreen

        config = StationConfig(
            station_code="ST-TEST",
            station_secret="secret",
            server_url="https://monitor.example",
            device="hw:1,0",
        )
        with (
            patch("tui.app.service_state", return_value="active"),
            patch("tui.app.control_service", return_value=(True, "OK")) as control,
            patch("tui.app.validate_recorder_config", return_value=(True, "OK")) as validate,
        ):
            result = ConfigurationScreen._validate_capture_change(config, initial=False)

        self.assertEqual(result, (True, "OK", True))
        control.assert_called_once_with("continuous-recorder.service", "stop")
        validate.assert_called_once_with(config)

    async def test_keyboard_configuration_route(self):
        from station_config import StationConfig, write_station_config
        from tui.app import ConfigurationScreen, SoundMonitorApp

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "station.toml"
            write_station_config(
                StationConfig(
                    station_code="ST-TEST",
                    station_secret="secret",
                    server_url="https://monitor.example",
                    device="hw:1,0",
                    recordings_dir=root / "recordings",
                    recorder_state_file=root / "recorder.json",
                    runtime_dir=root / "runtime",
                    metrics_output_dir=root / "runtime" / "audio_stats",
                ),
                config_path,
            )
            with (
                patch.object(SoundMonitorApp, "_collect_status", lambda _self: None),
                patch("tui.app.list_audio_devices", return_value=[{"device": "hw:1,0", "description": "Test"}]),
                patch("tui.app.validate_recorder_config", return_value=(True, "OK")),
                patch("tui.app.verify_station_credentials", return_value=(True, "OK")),
                patch.object(SoundMonitorApp, "_run_service_action", lambda *_args: None),
            ):
                app = SoundMonitorApp(config_path)
                async with app.run_test(size=(120, 40)) as pilot:
                    app._apply_status(
                        app.config,
                        {"state": "recording", "sample_rate": 44100, "channels": 2, "frames_in_segment": 22050},
                        {"state": "watching", "processed_count": 1, "failed_count": 0},
                        {"state": "idle", "last_sent_file": "sample.txt"},
                        {"total": 1, "pending": 0, "exhausted": 0},
                        8.0,
                        {
                            "continuous-recorder.service": "active",
                            "process-audio.service": "active",
                            "send-metrics.service": "active",
                        },
                        ["Evento de prueba"],
                    )
                    await pilot.press("c")
                    await pilot.pause()
                    self.assertIsInstance(app.screen, ConfigurationScreen)

    async def test_audio_selector_exposes_name_connection_and_backend(self):
        from textual.widgets import Select, Static
        from tui.app import ConfigurationScreen, SoundMonitorApp

        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "station.toml"
            config_path.write_text("# configuración inicial vacía\n", encoding="utf-8")
            device = {
                "device": "pulse",
                "description": "PulseAudio Sound Server",
                "display_name": "Test Bluetooth Headset",
                "connection": "Bluetooth",
                "backend": "PulseAudio/PipeWire",
                "source_name": "bluez_input.test",
                "is_default": "true",
            }
            with (
                patch.object(SoundMonitorApp, "_collect_status", lambda _self: None),
                patch("tui.app.list_audio_devices", return_value=[device]),
            ):
                app = SoundMonitorApp(config_path)
                async with app.run_test(size=(120, 40)) as pilot:
                    await pilot.pause()
                    screen = app.screen
                    self.assertIsInstance(screen, ConfigurationScreen)
                    screen.query_one("#device", Select).value = "pulse"
                    await pilot.pause()
                    details = str(screen.query_one("#device-details", Static).render())
                    self.assertIn("Bluetooth", details)
                    self.assertIn("PulseAudio/PipeWire", details)

    async def test_audio_selector_treats_unsafe_alsa_metadata_as_literal_text(self):
        from rich.text import Text
        from textual.widgets import Select
        from tui.app import ConfigurationScreen, SoundMonitorApp

        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "station.toml"
            config_path.write_text("# configuración inicial vacía\n", encoding="utf-8")
            device = {
                "device": "hw:1,0",
                "description": "Micrófono [USB]\n\x1b[31mfrontal\x1b[0m 🎙",
            }
            with (
                patch.object(SoundMonitorApp, "_collect_status", lambda _self: None),
                patch("tui.app.list_audio_devices", return_value=[device]),
            ):
                app = SoundMonitorApp(config_path)
                async with app.run_test(size=(120, 40)) as pilot:
                    await pilot.pause()
                    screen = app.screen
                    self.assertIsInstance(screen, ConfigurationScreen)
                    select = screen.query_one("#device", Select)
                    option_prompt = select._options[1][0]
                    self.assertIsInstance(option_prompt, Text)
                    self.assertIn("[USB]", option_prompt.plain)
                    self.assertNotIn("\x1b", option_prompt.plain)

                    select.focus()
                    await pilot.press("enter")
                    await pilot.pause()
                    self.assertIs(app.screen, screen)
                    self.assertTrue(select.expanded)
                    await pilot.press("down")
                    await pilot.press("enter")
                    await pilot.pause()
                    self.assertEqual(select.value, "hw:1,0")


if __name__ == "__main__":
    unittest.main()

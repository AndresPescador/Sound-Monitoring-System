import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(PROJECT_DIR))

import textual  # noqa: F401


class TuiContractTests(unittest.IsolatedAsyncioTestCase):
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


if __name__ == "__main__":
    unittest.main()

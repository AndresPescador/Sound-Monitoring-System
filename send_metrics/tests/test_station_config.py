import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from audio_spool import AudioSpool, published_wav_from_event
from runtime_status import atomic_write_json, read_json_snapshot
from station_config import StationConfig, load_station_config, write_station_config
from station_control import (
    audio_device_label,
    control_service,
    list_audio_devices,
    queue_summary,
    reactivate_exhausted,
    sanitize_event,
    service_state,
    service_states,
    validate_recorder_config,
)


class Completed:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class StationConfigTests(unittest.TestCase):
    def configured(self, root: Path) -> StationConfig:
        return StationConfig(
            station_code="ST-TEST-01",
            station_secret="secret-value",
            server_url="https://monitor.example",
            device="hw:1,0",
            recordings_dir=root / "recordings",
            recorder_state_file=root / "state.json",
            runtime_dir=root / "runtime",
            metrics_output_dir=root / "runtime" / "audio_stats",
        )

    def test_toml_roundtrip_and_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / ".config" / "sound-monitor" / "station.toml"
            expected = self.configured(root)
            write_station_config(expected, config_path)

            loaded = load_station_config(config_path, project_dir=root)
            self.assertEqual(loaded.station_code, expected.station_code)
            self.assertEqual(loaded.station_secret, expected.station_secret)
            self.assertEqual(loaded.device, expected.device)
            self.assertEqual(loaded.segment_seconds, 60)
            self.assertEqual(stat.S_IMODE(config_path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(config_path.parent.stat().st_mode), 0o700)

    def test_validation_rejects_credentials_in_url(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.configured(Path(directory)).updated(
                server_url="https://user:password@monitor.example"
            )
            self.assertTrue(any("credenciales" in error for error in config.validate()))

    def test_toml_is_not_overridden_by_legacy_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "station.toml"
            write_station_config(self.configured(root), config_path)

            with patch.dict(
                os.environ,
                {"STATION_CODE": "ENV-STATION", "RECORDINGS_DIR": "/tmp/wrong"},
            ):
                loaded = load_station_config(config_path, project_dir=root)

            self.assertEqual(loaded.station_code, "ST-TEST-01")
            self.assertEqual(loaded.recordings_dir, root / "recordings")

    def test_atomic_runtime_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime" / "status.json"
            atomic_write_json(path, {"state": "recording", "frames": 44100})
            self.assertEqual(read_json_snapshot(path)["state"], "recording")

    def test_service_control_is_allowlisted(self):
        commands = []

        def runner(command, **_kwargs):
            commands.append(command)
            return Completed()

        ok, _ = control_service("continuous-recorder.service", "restart", runner=runner)
        self.assertTrue(ok)
        self.assertIn("restart", commands[0])
        with self.assertRaises(ValueError):
            control_service("ssh.service", "restart", runner=runner)
        with self.assertRaises(ValueError):
            control_service("continuous-recorder.service", "enable", runner=runner)

    def test_service_states_are_read_in_one_call(self):
        commands = []

        def runner(command, **_kwargs):
            commands.append(command)
            return Completed(
                stdout=(
                    "Id=continuous-recorder.service\nActiveState=active\n\n"
                    "Id=process-audio.service\nActiveState=inactive\n\n"
                    "Id=send-metrics.service\nActiveState=failed\n"
                )
            )

        states = service_states(runner=runner)
        self.assertEqual(states["continuous-recorder.service"], "active")
        self.assertEqual(states["process-audio.service"], "inactive")
        self.assertEqual(states["send-metrics.service"], "failed")
        self.assertEqual(len(commands), 1)

    def test_service_status_timeout_degrades_to_unknown(self):
        def runner(*_args, **_kwargs):
            raise subprocess.TimeoutExpired("systemctl", 5)

        self.assertEqual(
            service_state("continuous-recorder.service", runner=runner),
            "desconocido",
        )
        self.assertTrue(all(value == "desconocido" for value in service_states(runner).values()))

    def test_audio_devices_show_default_bluetooth_source_and_usb_bus(self):
        commands = []
        sources = [
            {
                "name": "bluez_input.00_11_22_33_44_55.0",
                "description": "Test Bluetooth Headset",
                "properties": {
                    "bluez5.alias": "Test Bluetooth Headset",
                    "device.api": "bluez5",
                    "device.bus": "bluetooth",
                },
                "active_port": {"name": "headset-input", "description": "Headset Head Unit"},
            }
        ]

        def runner(command, **_kwargs):
            commands.append(command)
            if command[0] == "continuous-recorder":
                return Completed(
                    stdout=json.dumps(
                        [
                            {"device": "pulse", "description": "PulseAudio Sound Server"},
                            {"device": "hw:2,0", "description": "USB Audio CODEC"},
                        ]
                    )
                )
            if command[1:] == ["get-default-source"]:
                return Completed(stdout="bluez_input.00_11_22_33_44_55.0\n")
            return Completed(stdout=json.dumps(sources))

        devices = list_audio_devices(runner=runner, pactl_binary="pactl")

        self.assertEqual(devices[0]["display_name"], "Test Bluetooth Headset")
        self.assertEqual(devices[0]["connection"], "Bluetooth")
        self.assertEqual(devices[1]["connection"], "USB")
        self.assertEqual(
            audio_device_label(devices[0]),
            "Test Bluetooth Headset — Bluetooth · predeterminado [pulse]",
        )
        self.assertEqual(len(commands), 3)

    def test_audio_device_metadata_failure_keeps_alsa_fallback(self):
        def runner(command, **_kwargs):
            if command[0] == "continuous-recorder":
                return Completed(
                    stdout=json.dumps(
                        [{"device": "pulse", "description": "PulseAudio Sound Server"}]
                    )
                )
            raise subprocess.TimeoutExpired(command, 4)

        devices = list_audio_devices(runner=runner, pactl_binary="pactl")

        self.assertEqual(devices[0]["connection"], "Fuente predeterminada")
        self.assertEqual(devices[0]["backend"], "PulseAudio/PipeWire")

    def test_installer_validates_audio_as_station_user(self):
        installer = (PROJECT_DIR / "setup" / "install_station.sh").read_text(encoding="utf-8")

        self.assertIn('runuser -u "$STATION_USER" -- env', installer)
        self.assertIn('PULSE_SERVER="unix:/run/user/$STATION_UID/pulse/native"', installer)
        self.assertNotIn(
            '\n/usr/local/bin/continuous-recorder validate-config --config "$CONFIG_PATH"',
            installer,
        )

    def test_recorder_validation_does_not_require_systemd_runtime_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.configured(root).updated(
                recorder_state_file=Path("/run/continuous-recorder/state.json")
            )
            observed = {}

            def runner(command, **_kwargs):
                temporary_config = Path(command[-1])
                loaded = load_station_config(temporary_config, project_dir=root)
                observed["state_file"] = loaded.recorder_state_file
                loaded.recorder_state_file.write_text("{}", encoding="utf-8")
                return Completed(stdout="Configuración válida")

            ok, message = validate_recorder_config(config, runner=runner)

            self.assertTrue(ok)
            self.assertEqual(message, "Configuración válida")
            self.assertEqual(
                observed["state_file"],
                config.runtime_dir / "recorder-validation-state.json",
            )
            self.assertFalse(observed["state_file"].exists())

    def test_reactivate_exhausted_preserves_non_exhausted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.configured(root)
            config.runtime_dir.mkdir(parents=True)
            config.metrics_output_dir.mkdir(parents=True)
            (config.metrics_output_dir / "a.txt").touch()
            (config.metrics_output_dir / "b.txt").touch()
            failed_path = config.runtime_dir / "failed_files.json"
            failed_path.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "files": {
                            "a.txt": {"attempts": 3, "kind": "permanent"},
                            "b.txt": {"attempts": 1, "kind": "temporary"},
                        },
                    }
                ),
                encoding="utf-8",
            )

            removed = reactivate_exhausted(config)

            self.assertEqual(removed, 1)
            self.assertEqual(
                read_json_snapshot(failed_path),
                {
                    "version": 2,
                    "files": {
                        "b.txt": {
                            "attempts": 1,
                            "kind": "temporary",
                            "last_error": "",
                            "updated_at": "",
                        }
                    },
                },
            )

    def test_queue_summary_reconciles_stale_index_from_metric_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.configured(root)
            config.metrics_output_dir.mkdir(parents=True)
            (config.metrics_output_dir / "new.txt").write_text("{}", encoding="utf-8")
            (config.metrics_output_dir / "index.json").write_text("[]", encoding="utf-8")

            summary = queue_summary(config)

            self.assertEqual(summary["total"], 1)
            self.assertEqual(summary["pending"], 1)
            self.assertEqual(
                json.loads((config.metrics_output_dir / "index.json").read_text(encoding="utf-8")),
                ["new.txt"],
            )

    def test_queue_summary_ignores_failed_entries_without_metric(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = self.configured(root)
            config.metrics_output_dir.mkdir(parents=True)
            config.runtime_dir.mkdir(parents=True, exist_ok=True)
            (config.metrics_output_dir / "active.txt").write_text("{}", encoding="utf-8")
            (config.runtime_dir / "failed_files.json").write_text(
                json.dumps(
                    {
                        "version": 2,
                        "files": {
                            "missing.txt": {"attempts": 3, "kind": "permanent"},
                            "active.txt": {"attempts": 3, "kind": "permanent"},
                        },
                    }
                ),
                encoding="utf-8",
            )

            summary = queue_summary(config)

            self.assertEqual(summary["total"], 1)
            self.assertEqual(summary["exhausted"], 1)
            self.assertEqual(summary["exhausted_files"], ["active.txt"])

    def test_event_sanitization_hides_secrets_and_tokens(self):
        message = "secret-value Bearer eyJabc.def.ghi"
        sanitized = sanitize_event(message, "secret-value")
        self.assertNotIn("secret-value", sanitized)
        self.assertNotIn("eyJabc", sanitized)

    def test_recorder_rename_event_resolves_final_wav(self):
        event = type(
            "MovedEvent",
            (),
            {
                "is_directory": False,
                "src_path": "/tmp/segment.wav.part",
                "dest_path": "/tmp/segment.wav",
            },
        )()

        self.assertEqual(
            published_wav_from_event(event, moved=True),
            Path("/tmp/segment.wav"),
        )

    def test_audio_spool_reconciles_and_deduplicates_events(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = root / "first.wav"
            second = root / "second.wav"
            partial = root / "third.wav.part"
            first.touch()
            second.touch()
            partial.touch()

            spool = AudioSpool()
            self.assertTrue(spool.enqueue(first))
            self.assertEqual(spool.reconcile(root), 1)
            self.assertFalse(spool.enqueue(second))
            self.assertEqual(spool.qsize(), 2)

            queued = {spool.get(timeout=0.1), spool.get(timeout=0.1)}
            self.assertEqual(queued, {first.absolute(), second.absolute()})
            for path in queued:
                spool.finish(path)

    def test_audio_spool_defers_retry_without_losing_file(self):
        now = [100.0]
        spool = AudioSpool(clock=lambda: now[0])
        path = Path("/tmp/retry.wav")

        self.assertTrue(spool.enqueue(path))
        queued = spool.get(timeout=0.1)
        spool.finish(queued, retry_after_seconds=60)
        self.assertFalse(spool.enqueue(path))
        now[0] = 161.0
        self.assertTrue(spool.enqueue(path))


if __name__ == "__main__":
    unittest.main()

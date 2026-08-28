import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

_IMPORT_ROOT = tempfile.TemporaryDirectory()
_IMPORT_PATH = Path(_IMPORT_ROOT.name)
_CONFIG_PATH = _IMPORT_PATH / "station.toml"
_METRICS_PATH = _IMPORT_PATH / "metrics"
_RUNTIME_PATH = _IMPORT_PATH / "runtime"
_METRICS_PATH.mkdir()
_CONFIG_PATH.write_text(
    "\n".join(
        (
            'station_code = "ST-TEST"',
            'station_secret = "test-only"',
            'server_url = "https://monitor.example"',
            'device = "null"',
            f'runtime_dir = "{_RUNTIME_PATH.as_posix()}"',
            f'metrics_output_dir = "{_METRICS_PATH.as_posix()}"',
        )
    )
    + "\n",
    encoding="utf-8",
)
_PREVIOUS_CONFIG = os.environ.get("SOUND_MONITOR_CONFIG")
os.environ["SOUND_MONITOR_CONFIG"] = str(_CONFIG_PATH)
import send_metrics as sender  # noqa: E402
if _PREVIOUS_CONFIG is None:
    os.environ.pop("SOUND_MONITOR_CONFIG", None)
else:
    os.environ["SOUND_MONITOR_CONFIG"] = _PREVIOUS_CONFIG


def valid_payload(filename="segment.wav"):
    return {
        "timestamp": "2026-08-28T10:00:00",
        "filename": filename,
        "duration": 60.0,
        "sample_rate": 44100,
        "is_stereo": True,
        "dbfs_level": -20.0,
        "rms_energy": 0.1,
        "leq_dbfs": -22.0,
        "ch_left_dbfs": -20.0,
        "ch_right_dbfs": -20.0,
        "ch_left_rms": 0.1,
        "ch_right_rms": 0.1,
        "ild_db": 0.0,
        "interaural_correlation": 1.0,
        "dominant_frequency": 1000.0,
        "spectral_centroid": 1000.0,
        "spectral_rolloff": 1200.0,
        "zero_crossing_rate": 0.1,
    }


class Response:
    def __init__(self, status_code):
        self.status_code = status_code
        self.text = ""


class SendMetricsRecoveryTests(unittest.TestCase):
    def test_index_is_rebuilt_from_durable_metric_files(self):
        with tempfile.TemporaryDirectory() as directory:
            metrics = Path(directory)
            (metrics / "segment.txt").write_text("{}", encoding="utf-8")
            with patch.object(sender, "METRICS_OUTPUT_DIR", metrics):
                index = sender.read_index()

            self.assertEqual(index, ["segment.txt"])
            self.assertEqual(
                json.loads((metrics / "index.json").read_text(encoding="utf-8")),
                ["segment.txt"],
            )

    def test_confirmed_send_removes_local_metric(self):
        with tempfile.TemporaryDirectory() as directory:
            metrics = Path(directory)
            metric = metrics / "segment.txt"
            metric.write_text(json.dumps(valid_payload()), encoding="utf-8")
            (metrics / "index.json").write_text('["segment.txt"]', encoding="utf-8")
            with (
                patch.object(sender, "METRICS_OUTPUT_DIR", metrics),
                patch("send_metrics.httpx.post", return_value=Response(201)),
            ):
                outcome = sender.send_file("segment.txt", "test-token")

            self.assertEqual(outcome, sender.SendOutcome.SENT)
            self.assertFalse(metric.exists())

    def test_network_failure_keeps_metric_for_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            metrics = Path(directory)
            metric = metrics / "segment.txt"
            metric.write_text(json.dumps(valid_payload()), encoding="utf-8")
            request = httpx.Request("POST", "https://monitor.example/ingest/ingest")
            with (
                patch.object(sender, "METRICS_OUTPUT_DIR", metrics),
                patch(
                    "send_metrics.httpx.post",
                    side_effect=httpx.ConnectError("offline", request=request),
                ),
            ):
                outcome = sender.send_file("segment.txt", "test-token")

            self.assertEqual(outcome, sender.SendOutcome.RETRY)
            self.assertTrue(metric.exists())

    def test_cycle_prunes_failures_for_files_no_longer_present(self):
        saved = []
        with (
            patch("send_metrics.read_index", return_value=[]),
            patch("send_metrics.save_failed_files", side_effect=lambda value: saved.append(value)),
        ):
            result = sender.run_cycle(object(), {"missing.txt": 3})

        self.assertEqual(result, {})
        self.assertEqual(saved, [{}])


if __name__ == "__main__":
    unittest.main()

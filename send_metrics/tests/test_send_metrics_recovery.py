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


class FakeTokenManager:
    def __init__(self, tokens=None):
        self.tokens = iter(tokens) if tokens is not None else None
        self.next_refresh_at = None
        self.invalidations = 0

    def get_token(self, force_refresh=False):
        return next(self.tokens) if self.tokens is not None else "test-token"

    def invalidate(self):
        self.invalidations += 1


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

    def test_legacy_failure_state_is_migrated_as_temporary(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "failed_files.json"
            path.write_text(json.dumps({"segment.txt": 3}), encoding="utf-8")
            with patch.object(sender, "FAILED_FILES_FILE", path):
                failed = sender.load_failed_files()

            self.assertEqual(failed["segment.txt"]["attempts"], 3)
            self.assertEqual(failed["segment.txt"]["kind"], "temporary")
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8")),
                {
                    "version": 2,
                    "files": {
                        "segment.txt": {
                            "attempts": 3,
                            "kind": "temporary",
                            "last_error": "",
                            "updated_at": "",
                        }
                    },
                },
            )

    def test_temporary_failure_remains_pending_after_retry_threshold(self):
        failed = {
            "segment.txt": {
                "attempts": sender.MAX_RETRIES + 5,
                "kind": "temporary",
            }
        }
        self.assertEqual(sender.get_pending_files(["segment.txt"], failed), ["segment.txt"])
        self.assertEqual(
            sender.get_pending_files(
                ["segment.txt"],
                {"segment.txt": {"attempts": 1, "kind": "permanent"}},
            ),
            [],
        )

    def test_max_backlog_limits_recoverable_files_per_cycle(self):
        failed = {
            "first.txt": {"attempts": 20, "kind": "temporary"},
            "second.txt": {"attempts": 20, "kind": "temporary"},
        }
        with patch.object(sender, "MAX_BACKLOG", 1):
            self.assertEqual(
                sender.get_pending_files(["first.txt", "second.txt"], failed),
                ["first.txt"],
            )

    def test_delivery_backoff_grows_and_resets(self):
        backoff = sender.DeliveryBackoff(30, 900)
        backoff.register_failure("offline")
        first_wait = (backoff.next_retry_at - sender.datetime.now(sender.timezone.utc)).total_seconds()
        self.assertGreaterEqual(first_wait, 29)
        self.assertLessEqual(first_wait, 30.5)

        backoff.next_retry_at = sender.datetime.now(sender.timezone.utc)
        backoff.register_failure("offline again")
        second_wait = (backoff.next_retry_at - sender.datetime.now(sender.timezone.utc)).total_seconds()
        self.assertGreaterEqual(second_wait, 59)
        self.assertLessEqual(second_wait, 60.5)

        backoff.reset()
        self.assertEqual(backoff.failures, 0)
        self.assertIsNone(backoff.next_retry_at)

    def test_cycle_stops_after_first_transport_failure_and_keeps_all_metrics(self):
        saved = []
        backoff = sender.DeliveryBackoff(30, 900)
        with (
            patch("send_metrics.read_index", side_effect=[["first.txt", "second.txt"], ["first.txt", "second.txt"]]),
            patch("send_metrics.send_file", return_value=sender.SendOutcome.RETRY) as send_file,
            patch("send_metrics.save_failed_files", side_effect=lambda value: saved.append(value)),
        ):
            result = sender.run_cycle(FakeTokenManager(), {}, backoff)

        send_file.assert_called_once_with("first.txt", "test-token")
        self.assertIn("first.txt", result)
        self.assertEqual(result["first.txt"]["kind"], "temporary")
        self.assertNotIn("second.txt", [call.args[0] for call in send_file.call_args_list])
        self.assertEqual(backoff.failures, 1)
        self.assertTrue(backoff.is_waiting())
        self.assertEqual(len(saved), 1)

    def test_permanent_failure_is_paused_without_blocking_other_files(self):
        saved = []
        with (
            patch("send_metrics.read_index", side_effect=[["bad.txt", "good.txt"], ["bad.txt", "good.txt"]]),
            patch(
                "send_metrics.send_file",
                side_effect=[sender.SendOutcome.PERMANENT_FAILURE, sender.SendOutcome.RETRY],
            ) as send_file,
            patch("send_metrics.save_failed_files", side_effect=lambda value: saved.append(value)),
        ):
            result = sender.run_cycle(FakeTokenManager(), {}, sender.DeliveryBackoff(30, 900))

        self.assertEqual(send_file.call_count, 2)
        self.assertEqual(result["bad.txt"]["kind"], "permanent")
        self.assertEqual(result["good.txt"]["kind"], "temporary")

    def test_rejected_token_is_refreshed_and_second_rejection_is_retryable(self):
        saved = []
        with (
            patch("send_metrics.read_index", side_effect=[["segment.txt"], ["segment.txt"]]),
            patch(
                "send_metrics.send_file",
                side_effect=[sender.SendOutcome.TOKEN_REJECTED, sender.SendOutcome.TOKEN_REJECTED],
            ),
            patch("send_metrics.save_failed_files", side_effect=lambda value: saved.append(value)),
        ):
            result = sender.run_cycle(
                FakeTokenManager(["old-token", "new-token"]),
                {},
                sender.DeliveryBackoff(30, 900),
            )

        self.assertEqual(result["segment.txt"]["kind"], "temporary")
        self.assertEqual(result["segment.txt"]["attempts"], 1)

    def test_cycle_prunes_failures_for_files_no_longer_present(self):
        saved = []
        with (
            patch("send_metrics.read_index", return_value=[]),
            patch("send_metrics.save_failed_files", side_effect=lambda value: saved.append(value)),
        ):
            result = sender.run_cycle(
                FakeTokenManager(),
                {"missing.txt": {"attempts": 3, "kind": "temporary"}},
            )

        self.assertEqual(result, {})
        self.assertEqual(saved, [{}])


if __name__ == "__main__":
    unittest.main()

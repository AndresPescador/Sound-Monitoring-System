import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf
from watchdog.observers import Observer


PROJECT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

# process_audio configura logging y estado al importarse. Se le entrega una
# configuración de prueba explícita para no consultar .env ni credenciales del
# entorno de desarrollo.
_IMPORT_ROOT = tempfile.TemporaryDirectory()
_IMPORT_PATH = Path(_IMPORT_ROOT.name)
_CONFIG_PATH = _IMPORT_PATH / "station.toml"
_CONFIG_PATH.write_text(
    "\n".join(
        (
            'station_code = "ST-TEST"',
            'station_secret = "test-only"',
            'server_url = "https://monitor.example"',
            'device = "null"',
            'sample_rate = 44100',
            'channels = "stereo"',
            'segment_seconds = 60',
            f'output_dir = "{(_IMPORT_PATH / "recordings").as_posix()}"',
            f'state_file = "{(_IMPORT_PATH / "state.json").as_posix()}"',
            f'runtime_dir = "{(_IMPORT_PATH / "runtime").as_posix()}"',
            f'metrics_output_dir = "{(_IMPORT_PATH / "metrics").as_posix()}"',
        )
    )
    + "\n",
    encoding="utf-8",
)
_PREVIOUS_CONFIG = os.environ.get("SOUND_MONITOR_CONFIG")
os.environ["SOUND_MONITOR_CONFIG"] = str(_CONFIG_PATH)
from audio_spool import AudioSpool  # noqa: E402
from process_audio import AudioFileHandler, AudioProcessor  # noqa: E402
from runtime_status import atomic_write_json  # noqa: E402
if _PREVIOUS_CONFIG is None:
    os.environ.pop("SOUND_MONITOR_CONFIG", None)
else:
    os.environ["SOUND_MONITOR_CONFIG"] = _PREVIOUS_CONFIG


class ProcessAudioRecoveryTests(unittest.TestCase):
    def test_watchdog_rename_enqueues_final_wav(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            partial = root / "segment.wav.part"
            final = root / "segment.wav"
            spool = AudioSpool()
            observer = Observer()
            observer.schedule(AudioFileHandler(spool), str(root), recursive=False)
            observer.start()
            try:
                partial.write_bytes(b"complete")
                os.replace(partial, final)
                queued = spool.get(timeout=3)
                self.assertEqual(queued, final.absolute())
                spool.finish(queued)
            finally:
                observer.stop()
                observer.join()

    def test_real_wav_is_published_before_source_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            recordings = root / "recordings"
            metrics = root / "metrics"
            recordings.mkdir()
            wav_path = recordings / "Rec 2026-08-28 10h00m00s 1.wav"

            sample_rate = 44100
            time_axis = np.arange(sample_rate // 5, dtype=np.float32) / sample_rate
            signal = 0.1 * np.sin(2 * np.pi * 1000 * time_axis)
            stereo = np.column_stack((signal, signal))
            sf.write(wav_path, stereo, sample_rate, subtype="PCM_24")

            processor = AudioProcessor(output_dir=metrics)
            result = processor.process_audio_file(str(wav_path))

            metric_path = metrics / f"{wav_path.stem}.txt"
            self.assertEqual(result, "processed")
            self.assertFalse(wav_path.exists())
            payload = json.loads(metric_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["filename"], wav_path.name)
            self.assertEqual(payload["sample_rate"], sample_rate)

    def test_metric_publication_failure_preserves_wav_for_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wav_path = root / "segment.wav"
            wav_path.write_bytes(b"wav-data")
            processor = AudioProcessor(output_dir=root / "metrics")

            with (
                patch.object(processor, "extract_audio_features", return_value={"value": 1}),
                patch.object(processor, "save_metrics", return_value=False),
            ):
                result = processor.process_audio_file(str(wav_path))

            self.assertEqual(result, "retry")
            self.assertTrue(wav_path.exists())

    def test_corrupt_wav_is_quarantined_instead_of_deleted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wav_path = root / "corrupt.wav"
            wav_path.write_bytes(b"not-a-wave")
            processor = AudioProcessor(output_dir=root / "metrics")

            result = processor.process_audio_file(str(wav_path))

            quarantined = root / ".failed" / wav_path.name
            self.assertEqual(result, "quarantined")
            self.assertFalse(wav_path.exists())
            self.assertTrue(quarantined.exists())
            self.assertTrue(
                quarantined.with_suffix(".wav.error.txt").exists()
            )

    def test_only_abandoned_partial_is_quarantined(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            recordings = root / "recordings"
            recordings.mkdir()
            active_final = recordings / "active.wav"
            active_partial = recordings / "active.wav.part"
            stale_partial = recordings / "stale.wav.part"
            active_partial.write_bytes(b"active")
            stale_partial.write_bytes(b"stale")
            old = time.time() - 120
            os.utime(active_partial, (old, old))
            os.utime(stale_partial, (old, old))
            state_path = root / "recorder-state.json"
            atomic_write_json(
                state_path,
                {"state": "recording", "current_file": str(active_final)},
            )
            processor = AudioProcessor(output_dir=root / "metrics")

            moved = processor.quarantine_stale_partials(
                recordings,
                state_path,
                min_age=60,
            )

            self.assertEqual(moved, 1)
            self.assertTrue(active_partial.exists())
            self.assertFalse(stale_partial.exists())
            self.assertTrue((recordings / ".failed" / stale_partial.name).exists())


if __name__ == "__main__":
    unittest.main()

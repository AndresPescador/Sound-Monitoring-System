#!/usr/bin/env python3
"""Genera una cola ficticia compatible con send_metrics.py, sin secretos."""

import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path


DEFAULT_OUTPUT = Path(__file__).resolve().parent / "audio_stats"


def metric_for(moment, sequence):
    """Crea una medición estéreo plausible con todos los campos requeridos."""
    dbfs = -46.0 + (sequence % 7) * 1.35
    left_dbfs = dbfs + (0.5 if sequence % 2 == 0 else -0.4)
    right_dbfs = dbfs - (0.5 if sequence % 2 == 0 else -0.4)
    rms = 10 ** (dbfs / 20)
    filename = moment.strftime("Rec %Y-%m-%d %Hh%Mm%Ss 1.wav")

    return {
        "timestamp": moment.isoformat(),
        "filename": filename,
        "dbfs_level": round(dbfs, 3),
        "rms_energy": round(rms, 8),
        "leq_dbfs": round(dbfs - 3.2, 3),
        "ch_left_dbfs": round(left_dbfs, 3),
        "ch_right_dbfs": round(right_dbfs, 3),
        "ch_left_rms": round(10 ** (left_dbfs / 20), 8),
        "ch_right_rms": round(10 ** (right_dbfs / 20), 8),
        "ild_db": round(left_dbfs - right_dbfs, 3),
        "interaural_correlation": round(0.42 + (sequence % 6) * 0.09, 3),
        "dominant_frequency": round(260.0 + (sequence % 8) * 137.5, 3),
        "spectral_centroid": round(1200.0 + (sequence % 9) * 215.0, 3),
        "spectral_rolloff": round(3100.0 + (sequence % 10) * 340.0, 3),
        "zero_crossing_rate": round(0.055 + (sequence % 7) * 0.012, 4),
        "duration": 60.0,
        "sample_rate": 44100,
        "is_stereo": True,
    }


def main():
    parser = argparse.ArgumentParser(description="Generar métricas acústicas ficticias")
    parser.add_argument("--count", type=int, default=12, help="Número de archivos (por defecto: 12)")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Carpeta de salida (por defecto: examples/audio_stats)",
    )
    parser.add_argument("--overwrite", action="store_true", help="Permitir sobrescribir archivos existentes")
    args = parser.parse_args()

    if args.count <= 0:
        parser.error("--count debe ser mayor que cero")

    output_dir = args.output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    start = datetime(2026, 8, 20, 18, 0, 0)
    queue = []

    for sequence in range(args.count):
        metrics = metric_for(start + timedelta(minutes=sequence), sequence)
        txt_name = Path(metrics["filename"]).with_suffix(".txt").name
        txt_path = output_dir / txt_name
        if txt_path.exists() and not args.overwrite:
            parser.error(f"Ya existe {txt_path}; use --overwrite o elija otra carpeta")
        txt_path.write_text(
            json.dumps(metrics, ensure_ascii=False, indent=4, allow_nan=False),
            encoding="utf-8",
        )
        queue.append(txt_name)

    (output_dir / "index.json").write_text(
        json.dumps(queue, ensure_ascii=False, indent=4),
        encoding="utf-8",
    )
    print(f"Se generaron {len(queue)} métricas en: {output_dir}")


if __name__ == "__main__":
    main()

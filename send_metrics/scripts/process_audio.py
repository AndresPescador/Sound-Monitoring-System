#!/usr/bin/env python3
"""
Uso:
    python scripts/process_audio.py [--watch] [--folder FOLDER_PATH] [--output OUTPUT_PATH]

    --watch:  Modo de monitoreo continuo (para Raspberry Pi)
    --folder: Carpeta donde se depositan los .wav  (por defecto: configuración compartida)
    --output: Carpeta donde se guardan los .txt    (por defecto: ./audio_stats/)
"""

import os
import sys
import numpy as np
import librosa
import re
import argparse
import signal
from datetime import datetime
import time
import logging
import json
import tempfile
import queue
from logging.handlers import RotatingFileHandler
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from audio_spool import AudioSpool, published_wav_from_event
from index_lock import index_lock
from runtime_status import StatusPublisher, read_json_snapshot
from station_config import load_station_config


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
STATION_CONFIG = load_station_config(project_dir=PROJECT_DIR)
RUNTIME_DIR = STATION_CONFIG.runtime_dir
DEFAULT_OUTPUT_DIR = STATION_CONFIG.metrics_output_dir
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
LOG_MAX_BYTES = STATION_CONFIG.log_max_bytes
LOG_BACKUP_COUNT = STATION_CONFIG.log_backup_count
PROCESS_STATUS = StatusPublisher(
    RUNTIME_DIR / "processor_status.json",
    "process-audio",
    current_file="",
    last_processed_file="",
    processed_count=0,
    failed_count=0,
    quarantined_count=0,
    queued_count=0,
)

RECONCILE_INTERVAL_SECONDS = 15
PROCESS_RETRY_DELAY_SECONDS = 60


# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler(
            RUNTIME_DIR / 'audio_processing_log.log',
            maxBytes=LOG_MAX_BYTES,
            backupCount=LOG_BACKUP_COUNT,
            encoding="utf-8",
        ),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def _handle_termination(_signum, _frame):
    raise KeyboardInterrupt


def _sync_directory(directory):
    """Persiste un rename en POSIX para resistir una pérdida repentina de energía."""
    try:
        directory_fd = os.open(str(directory), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


class AudioProcessor:
    """Clase para procesar archivos de audio y extraer métricas de ruido."""
    
    def __init__(self, output_dir=None):
        if output_dir is None:
            output_dir = DEFAULT_OUTPUT_DIR
        self.output_dir = output_dir
        self.processed_count = 0
        self.failed_count = 0
        self.quarantined_count = 0
        os.makedirs(self.output_dir, exist_ok=True)
        logger.info(f"Carpeta de salida: {self.output_dir}")
    
    def calculate_dbfs(self, audio_data):
        """
        Calcula el nivel dBFS (Decibeles Full Scale) del audio.
        Debe recibir la señal RAW (sin normalizar) para que el valor sea significativo.

        Args:
            audio_data (numpy.ndarray): Datos de audio en crudo (float32, rango ±1.0)

        Returns:
            float: Nivel dBFS
        """
        rms = np.sqrt(np.mean(audio_data**2))
        if rms < 1e-10:
            rms = 1e-10
        return 20 * np.log10(rms)

    def apply_a_weighting(self, audio, sr):
        """
        Aplica el filtro de ponderación A (curva A, IEC 61672) a la señal.
        La ponderación A imita la sensibilidad del oído humano en función
        de la frecuencia, atenuando graves y muy agudos.

        Args:
            audio (numpy.ndarray): Señal mono en crudo
            sr (int): Frecuencia de muestreo

        Returns:
            numpy.ndarray: Señal filtrada y normalizada a 0 dB en 1 kHz
        """
        from scipy.signal import bilinear_zpk, zpk2sos, sosfilt, zpk2tf, freqz

        f1, f2, f3, f4 = 20.598997, 107.65265, 737.86223, 12194.217
        w1 = 2 * np.pi * f1
        w2 = 2 * np.pi * f2
        w3 = 2 * np.pi * f3
        w4 = 2 * np.pi * f4

        # Ceros y polos del filtro analógico A-weighting
        zeros_s = [0, 0, 0, 0]
        poles_s = [-w1, -w1, -w2, -w3, -w4, -w4]
        gain_s = w4 ** 4

        # Transformada bilineal → filtro digital
        z_d, p_d, k_d = bilinear_zpk(zeros_s, poles_s, gain_s, sr)
        sos = zpk2sos(z_d, p_d, k_d)

        # Normalizar ganancia a 0 dB en 1 kHz
        w_1k = 2 * np.pi * 1000 / sr
        b, a = zpk2tf(z_d, p_d, k_d)
        _, h = freqz(b, a, worN=[w_1k])
        norm = abs(h[0])

        filtered = sosfilt(sos, audio)
        return filtered / norm if norm > 1e-10 else filtered

    def _silence_metrics(self, filename, file_path, duration, sample_rate, is_stereo):
        """Devuelve métricas de silencio para un WAV válido sin señal útil."""
        return {
            'timestamp': self.parse_timestamp_from_filename(file_path),
            'filename': filename,
            'dbfs_level': -100.0,
            'rms_energy': 0.0,
            'leq_dbfs': -100.0,
            'ch_left_dbfs': -100.0,
            'ch_right_dbfs': -100.0,
            'ch_left_rms': 0.0,
            'ch_right_rms': 0.0,
            'ild_db': 0.0,
            'interaural_correlation': 0.0,
            'dominant_frequency': 0.0,
            'spectral_centroid': 0.0,
            'spectral_rolloff': 0.0,
            'zero_crossing_rate': 0.0,
            'duration': float(duration),
            'sample_rate': int(sample_rate),
            'is_stereo': is_stereo,
        }
    

    def parse_timestamp_from_filename(self, file_path):
        """
        Extrae el timestamp de un nombre de archivo con formato:
        'Rec YYYY-MM-DD HHhMMmSSs ...'

        Args:
            file_path (str): Ruta del archivo cuyo nombre se debe analizar.

        Returns:
            datetime: Timestamp extraído
        """
        try:
            # Quitar extensión si existe
            name = Path(file_path).stem

            # Regex para capturar fecha y hora
            # Ejemplo que matchea: Rec 2025-06-16 16h36m00s 1
            pattern = r"Rec (\d{4}-\d{2}-\d{2}) (\d{2})h(\d{2})m(\d{2})s"
            match = re.search(pattern, name)

            if match:
                date_str, hour, minute, second = match.groups()
                datetime_str = f"{date_str} {hour}:{minute}:{second}"
                return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")

        except Exception as e:
            logger.warning(f"No se pudo parsear timestamp desde {file_path}: {e}")

        # Fallback → timestamp del archivo
        return datetime.fromtimestamp(os.path.getmtime(file_path))

    
    def extract_audio_features(self, file_path):
        """
        Extrae características de audio de un archivo .wav estéreo o mono.

        Métricas globales (mix mono):
          - dbfs_level      : Nivel RMS en dBFS (señal cruda)
          - rms_energy      : Energía RMS cruda
          - leq_dbfs        : Nivel equivalente continuo con ponderación A (dBFS)

        Métricas por canal (solo relevantes si is_stereo=True):
          - ch_left_dbfs / ch_right_dbfs     : Nivel dBFS por canal
          - ch_left_rms  / ch_right_rms      : RMS por canal
          - ild_db                           : Diferencia de nivel interaural (L - R)
          - interaural_correlation           : Correlación entre canales [-1, 1]
            → +1.0 = sonido frontal/difuso, cercano a 0 = fuente lateral

        Métricas espectrales (sobre mix mono normalizado):
          - dominant_frequency : Frecuencia dominante via STFT (más eficiente que FFT full)
          - spectral_centroid  : Centro de masa espectral (Hz)
          - spectral_rolloff   : Frecuencia de corte al 85% de energía (Hz)
          - zero_crossing_rate : Tasa de cruces por cero
        """
        try:
            import soundfile as sf

            audio_data, sample_rate = sf.read(file_path, dtype='float32')

            # ── Separar canales ──────────────────────────────────────────────
            is_stereo = audio_data.ndim > 1 and audio_data.shape[1] >= 2
            if is_stereo:
                ch_left  = audio_data[:, 0]
                ch_right = audio_data[:, 1]
                audio_mono = np.mean(audio_data, axis=1)
            else:
                audio_mono = audio_data.flatten()
                ch_left  = audio_mono
                ch_right = audio_mono

            duration = len(audio_mono) / sample_rate if sample_rate > 0 else 0
            filename  = os.path.basename(file_path)

            # ── Archivo vacío ────────────────────────────────────────────────
            if audio_mono.size == 0 or duration == 0:
                logger.warning(f"Archivo vacío detectado: {file_path}")
                return self._silence_metrics(filename, file_path, 0, sample_rate, is_stereo)

            # ── Métricas de nivel (señal RAW) ────────────────────────────────
            rms_mono  = np.sqrt(np.mean(audio_mono**2))
            rms_left  = np.sqrt(np.mean(ch_left**2))
            rms_right = np.sqrt(np.mean(ch_right**2))

            if rms_mono < 1e-10:
                logger.info(f"Silencio detectado: {file_path}")
                return self._silence_metrics(filename, file_path, duration, sample_rate, is_stereo)

            dbfs_mono  = self.calculate_dbfs(audio_mono)
            dbfs_left  = 20 * np.log10(max(rms_left,  1e-10))
            dbfs_right = 20 * np.log10(max(rms_right, 1e-10))

            # ── ILD e correlación interaural ─────────────────────────────────
            ild_db = float(dbfs_left - dbfs_right)
            if is_stereo:
                # np.corrcoef devuelve NaN si uno de los canales no tiene
                # variación (por ejemplo, un canal desconectado o en silencio).
                # 0.0 expresa que no hay correlación medible y mantiene el
                # payload dentro del contrato del servidor.
                if np.std(ch_left) < 1e-10 or np.std(ch_right) < 1e-10:
                    interaural_corr = 0.0
                else:
                    interaural_corr = float(np.corrcoef(ch_left, ch_right)[0, 1])
                    if not np.isfinite(interaural_corr):
                        interaural_corr = 0.0
            else:
                interaural_corr = 1.0

            # ── Leq con ponderación A ────────────────────────────────────────
            audio_a_weighted = self.apply_a_weighting(audio_mono, sample_rate)
            leq_dbfs = float(20 * np.log10(max(np.sqrt(np.mean(audio_a_weighted**2)), 1e-10)))

            # ── Normalizar solo para métricas espectrales ────────────────────
            audio_norm = audio_mono / np.max(np.abs(audio_mono))

            spectral_centroid    = float(np.mean(librosa.feature.spectral_centroid(y=audio_norm, sr=sample_rate)[0]))
            spectral_rolloff     = float(np.mean(librosa.feature.spectral_rolloff(y=audio_norm,  sr=sample_rate)[0]))
            zero_crossing_rate   = float(np.mean(librosa.feature.zero_crossing_rate(audio_norm)[0]))

            # ── Frecuencia dominante via STFT (más eficiente que FFT full) ───
            # STFT divide la señal en frames cortos → más robusto y mucho
            # menos memoria que hacer fft sobre los ~5M de muestras completas.
            stft_magnitude   = np.abs(librosa.stft(audio_norm))           # (bins, frames)
            mean_magnitude   = np.mean(stft_magnitude, axis=1)            # promedio temporal
            dominant_bin     = int(np.argmax(mean_magnitude))
            dominant_frequency = float(librosa.fft_frequencies(sr=sample_rate, n_fft=2048)[dominant_bin])

            timestamp = self.parse_timestamp_from_filename(file_path)

            return {
                'timestamp':              timestamp,
                'filename':               filename,
                # Global
                'dbfs_level':             float(dbfs_mono),
                'rms_energy':             float(rms_mono),
                'leq_dbfs':               leq_dbfs,
                # Por canal
                'ch_left_dbfs':           float(dbfs_left),
                'ch_right_dbfs':          float(dbfs_right),
                'ch_left_rms':            float(rms_left),
                'ch_right_rms':           float(rms_right),
                # Binaural
                'ild_db':                 ild_db,
                'interaural_correlation': interaural_corr,
                # Espectral
                'dominant_frequency':     dominant_frequency,
                'spectral_centroid':      spectral_centroid,
                'spectral_rolloff':       spectral_rolloff,
                'zero_crossing_rate':     zero_crossing_rate,
                # Meta
                'duration':               float(duration),
                'sample_rate':            int(sample_rate),
                'is_stereo':              is_stereo,
            }

        except Exception:
            # Un WAV corrupto o un fallo de análisis no equivale a silencio.
            # Se conserva el original para diagnóstico y reprocesamiento.
            logger.exception(f"Error al procesar {file_path}; el WAV se conservará.")
            return None

    def save_metrics(self, metrics, file_path):
        """Publica una métrica completa y la deja visible para el emisor.

        El .txt es la fuente de verdad de la cola. Se publica mediante rename
        atómico para que send_metrics.py nunca lea JSON parcial; index.json es
        un manifiesto reconstruible de esos archivos.
        """
        results_dir = Path(self.output_dir)
        base_name = Path(file_path).stem
        txt_path = results_dir / f"{base_name}.txt"
        temp_path = None

        try:
            fd, temp_name = tempfile.mkstemp(
                dir=results_dir,
                prefix=f".{base_name}.",
                suffix=".tmp",
                text=True,
            )
            temp_path = Path(temp_name)
            with os.fdopen(fd, "w", encoding="utf-8") as output_file:
                json.dump(
                    metrics,
                    output_file,
                    ensure_ascii=False,
                    indent=4,
                    allow_nan=False,
                )
                output_file.flush()
                os.fsync(output_file.fileno())

            os.replace(temp_path, txt_path)
            _sync_directory(results_dir)
            temp_path = None
            logger.info(f"Métricas guardadas en {txt_path}")

            index_path = results_dir / "index.json"
            try:
                # El índice se deriva del contenido durable de la cola. Si esta
                # actualización falla, send_metrics.py lo reconstruirá al leer.
                with index_lock(index_path):
                    txt_files = sorted(path.name for path in results_dir.glob("*.txt"))
                    tmp_index_path = index_path.with_suffix(".tmp")
                    tmp_index_path.write_text(
                        json.dumps(txt_files, ensure_ascii=False, indent=4),
                        encoding="utf-8",
                    )
                    tmp_index_path.replace(index_path)
                    _sync_directory(results_dir)
                logger.info(f"index.json actualizado con {len(txt_files)} archivos.")
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning(
                    "La métrica quedó publicada, pero no se pudo actualizar index.json; "
                    f"el emisor lo reconstruirá: {exc}"
                )

            return True
        except (OSError, TypeError, ValueError) as exc:
            logger.error(f"No se pudieron guardar las métricas de {file_path}: {exc}")
            return False
        finally:
            if temp_path is not None:
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError as exc:
                    logger.warning(f"No se pudo limpiar el temporal {temp_path}: {exc}")

    def metric_path_for(self, file_path):
        return Path(self.output_dir) / f"{Path(file_path).stem}.txt"

    def quarantine_failed_file(self, file_path, reason):
        """Aparta un WAV problemático sin destruirlo ni volver a analizarlo en bucle."""
        source = Path(file_path)
        quarantine_dir = source.parent / ".failed"
        try:
            quarantine_dir.mkdir(parents=True, exist_ok=True)
            destination = quarantine_dir / source.name
            suffix = 2
            while destination.exists():
                destination = quarantine_dir / f"{source.stem} ({suffix}){source.suffix}"
                suffix += 1
            os.replace(source, destination)
            _sync_directory(source.parent)
            _sync_directory(quarantine_dir)
        except OSError as exc:
            logger.error(
                f"No se pudo mover {source} a cuarentena; se conservará en origen: {exc}"
            )
            return None

        # El sidecar es diagnóstico, no parte de la transacción que preserva
        # el WAV. Si falla, el archivo ya está a salvo en cuarentena.
        try:
            error_path = destination.with_suffix(destination.suffix + ".error.txt")
            error_path.write_text(reason + "\n", encoding="utf-8")
        except OSError as exc:
            logger.warning(f"No se pudo escribir el motivo de cuarentena: {exc}")
        self.quarantined_count += 1
        logger.error(f"WAV conservado en cuarentena: {destination}")
        return destination

    def process_audio_file(self, file_path):
        """
        Procesa un único archivo de audio.

        Devuelve ``processed``, ``quarantined`` o ``retry``. El WAV solo se
        elimina después de publicar durablemente su métrica.
        """
        if not file_path.lower().endswith('.wav'):
            logger.warning(f"Archivo ignorado (no es .wav): {file_path}")
            return "ignored"

        if not os.path.exists(file_path):
            return "ignored"

        # Recuperación tras un cierre entre publicar la métrica y limpiar el
        # WAV. No se repite un análisis costoso si el .txt durable ya existe.
        if self.metric_path_for(file_path).exists():
            if self.cleanup_processed_file(file_path):
                logger.info(f"WAV residual limpiado: {file_path}")
                return "processed"
            return "retry"
        
        logger.info(f"Procesando: {file_path}")
        PROCESS_STATUS.publish(
            state="processing",
            current_file=os.path.basename(file_path),
            last_error="",
            processed_count=self.processed_count,
            failed_count=self.failed_count,
        )
        
        metrics = self.extract_audio_features(file_path)
        if metrics:
            for key, value in metrics.items():
                if isinstance(value, datetime):
                    metrics[key] = value.isoformat()

            if self.save_metrics(metrics, file_path):
                logger.info(f"Procesamiento completado: {os.path.basename(file_path)}")
                cleaned = self.cleanup_processed_file(file_path)
                self.processed_count += 1
                PROCESS_STATUS.publish(
                    state="watching",
                    current_file="",
                    last_processed_file=os.path.basename(file_path),
                    processed_count=self.processed_count,
                    failed_count=self.failed_count,
                    quarantined_count=self.quarantined_count,
                    last_error="",
                )
                return "processed" if cleaned else "retry"
            else:
                logger.error(
                    f"No se publicó la métrica; se conservará el WAV: {file_path}"
                )
                self.failed_count += 1
                PROCESS_STATUS.publish(
                    state="watching",
                    current_file="",
                    processed_count=self.processed_count,
                    failed_count=self.failed_count,
                    last_error=f"No se publicó la métrica de {os.path.basename(file_path)}.",
                )
                return "retry"
        else:
            logger.error(f"Falló el procesamiento; se conservará el WAV: {file_path}")
            self.failed_count += 1
            quarantined = self.quarantine_failed_file(
                file_path,
                "Falló el análisis acústico. Consulte audio_processing_log.log.",
            )
            PROCESS_STATUS.publish(
                state="watching",
                current_file="",
                processed_count=self.processed_count,
                failed_count=self.failed_count,
                quarantined_count=self.quarantined_count,
                last_quarantined_file=str(quarantined or ""),
                last_error=f"Falló el análisis de {os.path.basename(file_path)}; "
                + ("se movió a cuarentena." if quarantined else "se reintentará."),
            )
            return "quarantined" if quarantined else "retry"

    def quarantine_stale_partials(self, recordings_dir, recorder_state_file, min_age=60):
        """Conserva parciales abandonados por caídas sin tocar el archivo activo.

        Solo actúa cuando el grabador declara explícitamente cuál es su archivo
        actual. Esto evita confundir una pausa de ALSA con un parcial huérfano.
        """
        state = read_json_snapshot(Path(recorder_state_file))
        if state.get("state") != "recording" or not state.get("current_file"):
            return 0

        active_partial = Path(str(state["current_file"]) + ".part").absolute()
        now = time.time()
        moved = 0
        for partial in sorted(Path(recordings_dir).glob("*.wav.part")):
            try:
                age = now - partial.stat().st_mtime
            except OSError:
                continue
            if partial.absolute() == active_partial or age < min_age:
                continue
            destination = self.quarantine_failed_file(
                partial,
                "Parcial abandonado tras una interrupción del grabador.",
            )
            if destination is not None:
                moved += 1
        return moved

    
    def cleanup_processed_file(self, file_path: str):
        """
        Elimina el archivo de audio inmediatamente después de procesarlo 
        y publicar sus métricas en la cola local.

        Args:
            file_path (str): Ruta al archivo procesado
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Archivo eliminado después de procesar: {file_path}")
                _sync_directory(Path(file_path).parent)
                return True
            else:
                logger.warning(f"Archivo no encontrado al intentar eliminar: {file_path}")
                return True
        except OSError as e:
            logger.error(f"Error al eliminar archivo {file_path}: {e}")
            return False

    
    def process_folder(self, folder_path):
        """
        Procesa todos los archivos .wav en una carpeta.
        
        Args:
            folder_path (str): Ruta a la carpeta con archivos de audio
        """
        if not os.path.exists(folder_path):
            logger.error(f"La carpeta no existe: {folder_path}")
            return
        
        wav_files = sorted(f for f in os.listdir(folder_path) if f.lower().endswith('.wav'))
        
        if not wav_files:
            logger.warning(f"No se encontraron archivos .wav en: {folder_path}")
            return
        
        logger.info(f"Procesando {len(wav_files)} archivos en {folder_path}")
        
        for filename in wav_files:
            file_path = os.path.join(folder_path, filename)
            if AudioFileHandler(self).wait_for_file_completion(file_path, timeout=190):
                self.process_audio_file(file_path)
            else:
                logger.error(f"No se pudo procesar (archivo incompleto): {file_path}")

class AudioFileHandler(FileSystemEventHandler):
    """
    Handler para monitorear cambios en la carpeta de audio.
    
    Monitoreará la carpeta donde el
    programa C++ deposita los archivos de audio grabados.
    """
    
    def __init__(self, spool):
        self.spool = spool

    def on_created(self, event):
        path = published_wav_from_event(event)
        if path is not None and self.spool.enqueue(path):
            logger.info(f"WAV creado encolado: {path}")

    def on_moved(self, event):
        """Encola el WAV final cuando el grabador lo publica mediante rename."""
        path = published_wav_from_event(event, moved=True)
        if path is not None and self.spool.enqueue(path):
            logger.info(f"WAV publicado encolado: {path}")

    
    # Verificación de completitud del archivo
    def wait_for_file_completion(self, file_path: str, timeout: int = 360):
        """
        Espera hasta que el archivo esté completamente escrito.

        Útil para asegurar que el programa C++ haya terminado 
        de escribir el archivo antes de procesarlo.

        Args:
            file_path (str): Ruta al archivo
            timeout (int): Tiempo máximo de espera en segundos (default 6 minutos)

        Returns:
            bool: True si el archivo está completo, False si se alcanzó el timeout
        """
        start_time = time.time()
        last_size = -1

        while time.time() - start_time < timeout:
            try:
                current_size = os.path.getsize(file_path)
                if current_size == last_size and current_size > 0:
                    # El archivo dejó de crecer
                    logger.info(f"Archivo completo: {file_path}")
                    time.sleep(2)
                    return True
                last_size = current_size
                time.sleep(1)  # revisar cada segundo
            except OSError:
                # Puede que el archivo aún no exista del todo
                time.sleep(1)

        logger.warning(f"Timeout esperando completitud del archivo: {file_path}")
        return False

def main():
    """Función principal del script."""
    signal.signal(signal.SIGTERM, _handle_termination)
    parser = argparse.ArgumentParser(description='Procesador de audio para monitoreo de ruido')
    parser.add_argument('--watch', action='store_true',
                        help='Modo de monitoreo continuo (para Raspberry Pi)')
    parser.add_argument('--folder', default=str(STATION_CONFIG.recordings_dir),
                        help='Carpeta a monitorear (por defecto: configuración compartida)')
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_DIR),
                        help='Carpeta de salida para los .txt de métricas (por defecto: runtime/audio_stats/)')

    args = parser.parse_args()
    print(f"Carpeta de entrada : {args.folder}")
    print(f"Carpeta de salida  : {args.output}")

    # Crear la carpeta de audio si no existe
    os.makedirs(args.folder, exist_ok=True)

    # Inicializar el procesador con la carpeta de salida
    processor = AudioProcessor(output_dir=args.output)
    PROCESS_STATUS.publish(
        state="starting",
        input_dir=str(args.folder),
        output_dir=str(args.output),
        last_error="",
    )
    
    if args.watch:
        # El observador se inicia antes de reconciliar el directorio. Así no
        # existe una ventana entre el escaneo inicial y la suscripción a
        # eventos. AudioSpool deduplica si ambos detectan el mismo archivo.
        logger.info(f"Iniciando monitoreo continuo de: {args.folder}")
        logger.info("MODO RASPBERRY PI: Esperando archivos del programa C++ de grabación...")

        spool = AudioSpool()
        event_handler = AudioFileHandler(spool)
        observer = Observer()
        observer.schedule(event_handler, args.folder, recursive=False)
        observer.start()
        processor.quarantine_stale_partials(
            args.folder,
            STATION_CONFIG.recorder_state_file,
        )
        discovered = spool.reconcile(args.folder)
        logger.info(f"Reconciliación inicial: {discovered} WAV encolado(s).")
        PROCESS_STATUS.publish(
            state="watching",
            input_dir=str(args.folder),
            output_dir=str(args.output),
            current_file="",
            queued_count=spool.qsize(),
            last_error="",
        )

        next_reconciliation = time.monotonic() + RECONCILE_INTERVAL_SECONDS
        try:
            while True:
                timeout = max(0.1, next_reconciliation - time.monotonic())
                try:
                    file_path = spool.get(timeout=timeout)
                except queue.Empty:
                    spool.discard_missing()
                    processor.quarantine_stale_partials(
                        args.folder,
                        STATION_CONFIG.recorder_state_file,
                    )
                    spool.reconcile(args.folder)
                    next_reconciliation = time.monotonic() + RECONCILE_INTERVAL_SECONDS
                    PROCESS_STATUS.publish(
                        state="watching",
                        current_file="",
                        queued_count=spool.qsize(),
                    )
                    continue

                retry_after = 0
                try:
                    if not file_path.exists():
                        result = "ignored"
                    elif event_handler.wait_for_file_completion(str(file_path), timeout=360):
                        result = processor.process_audio_file(str(file_path))
                    else:
                        logger.error(f"No se pudo procesar (archivo incompleto): {file_path}")
                        result = "retry"
                    if result == "retry":
                        retry_after = PROCESS_RETRY_DELAY_SECONDS
                finally:
                    spool.finish(file_path, retry_after_seconds=retry_after)

                if time.monotonic() >= next_reconciliation:
                    spool.discard_missing()
                    processor.quarantine_stale_partials(
                        args.folder,
                        STATION_CONFIG.recorder_state_file,
                    )
                    spool.reconcile(args.folder)
                    next_reconciliation = time.monotonic() + RECONCILE_INTERVAL_SECONDS
        except KeyboardInterrupt:
            logger.info("Monitoreo detenido por el usuario")
        finally:
            observer.stop()
            observer.join()
            PROCESS_STATUS.publish(state="stopped", current_file="")
        
    else:
        # Modo de procesamiento por lotes (para desarrollo local)
        logger.info(f"Procesando archivos existentes en: {args.folder}")
        processor.process_folder(args.folder)
        logger.info("Procesamiento por lotes completado")
        PROCESS_STATUS.publish(state="stopped", current_file="")

if __name__ == "__main__":
    main()

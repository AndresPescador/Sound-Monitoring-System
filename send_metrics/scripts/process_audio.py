#!/usr/bin/env python3
"""
Uso:
    python scripts/process_audio.py [--watch] [--folder FOLDER_PATH] [--output OUTPUT_PATH]

    --watch:  Modo de monitoreo continuo (para Raspberry Pi)
    --folder: Carpeta donde se depositan los .wav  (por defecto: ~/Documents/)
    --output: Carpeta donde se guardan los .txt    (por defecto: ./audio_stats/)
"""

import os
import sys
import numpy as np
import librosa
import re
import argparse
from datetime import datetime
import time
import logging
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from datetime import datetime, timedelta
from dotenv import load_dotenv

from index_lock import index_lock


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
load_dotenv(PROJECT_DIR / ".env")


def _project_path(value: str, default: Path) -> Path:
    path = Path(value) if value else default
    return path if path.is_absolute() else PROJECT_DIR / path


RUNTIME_DIR = _project_path(os.getenv("RUNTIME_DIR", ""), PROJECT_DIR / "runtime")
DEFAULT_OUTPUT_DIR = _project_path(
    os.getenv("METRICS_OUTPUT_DIR", ""), RUNTIME_DIR / "audio_stats"
)
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(RUNTIME_DIR / 'audio_processing_log.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

class AudioProcessor:
    """Clase para procesar archivos de audio y extraer métricas de ruido."""
    
    def __init__(self, output_dir=None):
        if output_dir is None:
            output_dir = DEFAULT_OUTPUT_DIR
        self.output_dir = output_dir
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
        """Devuelve un dict de métricas con valores nulos para silencio o error."""
        return {
            'timestamp': self.parse_timestamp_from_filename(filename),
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
    

    def parse_timestamp_from_filename(self, filename):
        """
        Extrae el timestamp de un nombre de archivo con formato:
        'Rec YYYY-MM-DD HHhMMmSSs ...'

        Args:
            filename (str): Nombre del archivo (con o sin extensión)

        Returns:
            datetime: Timestamp extraído
        """
        try:
            # Quitar extensión si existe
            name = os.path.splitext(filename)[0]

            # Regex para capturar fecha y hora
            # Ejemplo que matchea: Rec 2025-06-16 16h36m00s 1
            pattern = r"Rec (\d{4}-\d{2}-\d{2}) (\d{2})h(\d{2})m(\d{2})s"
            match = re.search(pattern, name)

            if match:
                date_str, hour, minute, second = match.groups()
                datetime_str = f"{date_str} {hour}:{minute}:{second}"
                return datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")

        except Exception as e:
            logger.warning(f"No se pudo parsear timestamp desde {filename}: {e}")

        # Fallback → timestamp del archivo
        return datetime.fromtimestamp(os.path.getmtime(filename))

    
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
                interaural_corr = float(np.corrcoef(ch_left, ch_right)[0, 1])
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

            timestamp = self.parse_timestamp_from_filename(filename)

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

        except Exception as e:
            logger.error(f"Error al procesar {file_path}: {e}")
            return self._silence_metrics(
                os.path.basename(file_path), file_path, 0.0, 0, False
            )

    def process_audio_file(self, file_path):
        """
        Procesa un único archivo de audio.
        """
        if not file_path.lower().endswith('.wav'):
            logger.warning(f"Archivo ignorado (no es .wav): {file_path}")
            return
        
        logger.info(f"Procesando: {file_path}")
        
        metrics = self.extract_audio_features(file_path)
        if metrics:
            for key, value in metrics.items():
                if isinstance(value, datetime):
                    metrics[key] = value.isoformat()

            results_dir = self.output_dir

            base_name = os.path.splitext(os.path.basename(file_path))[0]
            txt_path = os.path.join(results_dir, f"{base_name}.txt")

            try:
                import json
                with open(txt_path, "w", encoding="utf-8") as f:
                    json.dump(metrics, f, ensure_ascii=False, indent=4)
                logger.info(f"Métricas guardadas en {txt_path}")
                index_path = os.path.join(results_dir, "index.json")
                # Compartir el bloqueo con send_metrics.py para que la
                # eliminación de un archivo no sea sobrescrita por una
                # actualización concurrente del productor.
                with index_lock(Path(index_path)):
                    txt_files = sorted(
                        f for f in os.listdir(results_dir) if f.endswith(".txt")
                    )
                    tmp_index_path = f"{index_path}.tmp"
                    with open(tmp_index_path, "w", encoding="utf-8") as f:
                        json.dump(txt_files, f, ensure_ascii=False, indent=4)
                    os.replace(tmp_index_path, index_path)
                logger.info(f"index.json actualizado con {len(txt_files)} archivos.")

            except Exception as e:
                logger.error(f"No se pudo guardar o actualizar archivos de métricas: {e}")
            
            logger.info(f"Procesamiento completado: {os.path.basename(file_path)}")
            self.cleanup_processed_file(file_path)
        else:
            logger.error(f"Falló el procesamiento: {file_path}")

    
    def cleanup_processed_file(self, file_path: str):
        """
        Elimina el archivo de audio inmediatamente después de procesarlo 
        y guardar sus métricas en la base de datos.

        Args:
            file_path (str): Ruta al archivo procesado
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Archivo eliminado después de procesar: {file_path}")
            else:
                logger.warning(f"Archivo no encontrado al intentar eliminar: {file_path}")
        except Exception as e:
            logger.error(f"Error al eliminar archivo {file_path}: {e}")

    
    def process_folder(self, folder_path):
        """
        Procesa todos los archivos .wav en una carpeta.
        
        Args:
            folder_path (str): Ruta a la carpeta con archivos de audio
        """
        if not os.path.exists(folder_path):
            logger.error(f"La carpeta no existe: {folder_path}")
            return
        
        wav_files = [f for f in os.listdir(folder_path) if f.lower().endswith('.wav')]
        
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
    
    def __init__(self, processor):
        self.processor = processor
    
    def on_created(self, event):
        """
        Se ejecuta cuando se crea un nuevo archivo .wav
        """
        if not event.is_directory and event.src_path.lower().endswith('.wav'):
            logger.info(f"Nuevo archivo detectado: {event.src_path}")

            # Esperar a que el archivo esté completo antes de procesarlo
            if self.wait_for_file_completion(event.src_path, timeout=360):
                self.processor.process_audio_file(event.src_path)
            else:
                logger.error(f"No se pudo procesar (archivo incompleto): {event.src_path}")

    
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
    parser = argparse.ArgumentParser(description='Procesador de audio para monitoreo de ruido')
    parser.add_argument('--watch', action='store_true',
                        help='Modo de monitoreo continuo (para Raspberry Pi)')
    parser.add_argument('--folder', default=os.path.join(os.path.expanduser("~"), "Documents"),
                        help='Carpeta a monitorear (por defecto: ~/Documents/)')
    parser.add_argument('--output', default=str(DEFAULT_OUTPUT_DIR),
                        help='Carpeta de salida para los .txt de métricas (por defecto: runtime/audio_stats/)')

    args = parser.parse_args()
    print(f"Carpeta de entrada : {args.folder}")
    print(f"Carpeta de salida  : {args.output}")

    # Crear la carpeta de audio si no existe
    os.makedirs(args.folder, exist_ok=True)

    # Inicializar el procesador con la carpeta de salida
    processor = AudioProcessor(output_dir=args.output)
    
    if args.watch:

        processor.process_folder(args.folder)
        # Modo de monitoreo continuo 
        logger.info(f"Iniciando monitoreo continuo de: {args.folder}")
        logger.info("MODO RASPBERRY PI: Esperando archivos del programa C++ de grabación...")
        
        event_handler = AudioFileHandler(processor)
        observer = Observer()
        observer.schedule(event_handler, args.folder, recursive=False)
        observer.start()
        
        try:
            while True:
                time.sleep(1)
                
        except KeyboardInterrupt:
            observer.stop()
            logger.info("Monitoreo detenido por el usuario")
        
        observer.join()
        
    else:
        # Modo de procesamiento por lotes (para desarrollo local)
        logger.info(f"Procesando archivos existentes en: {args.folder}")
        processor.process_folder(args.folder)
        logger.info("Procesamiento por lotes completado")

if __name__ == "__main__":
    main()

from datetime import datetime
from pydantic import BaseModel, Field


class MeasurementPayload(BaseModel):
    """
    Modelo de validación del JSON enviado por la estación.
    Todos los campos corresponden exactamente a los generados
    por process_audio.py en extract_audio_features().
    """

    # ── Meta ──────────────────────────────────────────────────────────────────
    timestamp: datetime = Field(
        description="Inicio del fragmento de grabación. "
                    "Extraído del nombre del archivo .wav por el script."
    )
    filename: str = Field(
        description="Nombre del archivo .wav procesado."
    )
    duration: float = Field(
        ge=0,
        description="Duración del fragmento en segundos."
    )
    sample_rate: int = Field(
        gt=0,
        description="Frecuencia de muestreo en Hz."
    )
    is_stereo: bool = Field(
        description="True si el archivo tenía dos canales."
    )

    # ── Nivel global (mix mono, señal cruda) ──────────────────────────────────
    dbfs_level: float = Field(
        description="Nivel RMS del mix mono en dBFS."
    )
    rms_energy: float = Field(
        ge=0,
        description="Energía RMS del mix mono (valor lineal 0.0 – 1.0)."
    )
    leq_dbfs: float = Field(
        description="Nivel equivalente continuo con ponderación A (IEC 61672) en dBFS."
    )

    # ── Por canal ─────────────────────────────────────────────────────────────
    ch_left_dbfs: float = Field(description="Nivel dBFS canal izquierdo.")
    ch_right_dbfs: float = Field(description="Nivel dBFS canal derecho.")
    ch_left_rms: float = Field(ge=0, description="RMS canal izquierdo.")
    ch_right_rms: float = Field(ge=0, description="RMS canal derecho.")

    # ── Binaural ──────────────────────────────────────────────────────────────
    ild_db: float = Field(
        description="Diferencia de nivel interaural (ch_left_dbfs - ch_right_dbfs) en dB. "
                    "Positivo = predominio izquierdo."
    )
    interaural_correlation: float = Field(
        ge=-1.0,
        le=1.0,
        description="Correlación entre canales [-1, 1]. "
                    "Cercano a +1 = campo difuso / frontal. "
                    "Cercano a 0 = fuente lateral definida."
    )

    # ── Espectral ─────────────────────────────────────────────────────────────
    dominant_frequency: float = Field(
        ge=0,
        description="Frecuencia dominante en Hz estimada mediante STFT."
    )
    spectral_centroid: float = Field(
        ge=0,
        description="Centro de masa espectral en Hz."
    )
    spectral_rolloff: float = Field(
        ge=0,
        description="Frecuencia por debajo de la cual se concentra el 85% de la energía (Hz)."
    )
    zero_crossing_rate: float = Field(
        ge=0,
        description="Tasa de cruces por cero."
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "timestamp": "2025-06-16T16:36:00",
                "filename": "Rec 2025-06-16 16h36m00s 1.wav",
                "duration": 120.0,
                "sample_rate": 48000,
                "is_stereo": True,
                "dbfs_level": -18.42,
                "rms_energy": 0.1198,
                "leq_dbfs": -21.07,
                "ch_left_dbfs": -18.91,
                "ch_right_dbfs": -19.34,
                "ch_left_rms": 0.1134,
                "ch_right_rms": 0.1079,
                "ild_db": 0.43,
                "interaural_correlation": 0.8712,
                "dominant_frequency": 125.0,
                "spectral_centroid": 1842.5,
                "spectral_rolloff": 4210.3,
                "zero_crossing_rate": 0.0421,
            }
        }
    }


class IngestResponse(BaseModel):
    """Respuesta devuelta por el endpoint POST /ingest."""
    status: str
    message: str
    station_code: str
    recorded_at: datetime
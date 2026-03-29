from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


class MeasurementPayload(BaseModel):
    """
    Modelo de validación del JSON enviado por la estación.
    Acepta camelCase en el JSON entrante (sampleRate, isStereo, etc.)
    y lo mapea automáticamente a los atributos snake_case de Python.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,   # acepta camelCase en el JSON
        populate_by_name=True       # también acepta snake_case si hace falta
    )

    # ── Meta ──────────────────────────────────────────────────────────────────
    timestamp: datetime = Field(
        description="Inicio del fragmento de grabación."
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
        description="Diferencia de nivel interaural (ch_left_dbfs - ch_right_dbfs) en dB."
    )
    interaural_correlation: float = Field(
        ge=-1.0,
        le=1.0,
        description="Correlación entre canales [-1, 1]."
    )

    # ── Espectral ─────────────────────────────────────────────────────────────
    dominant_frequency: float = Field(ge=0, description="Frecuencia dominante en Hz.")
    spectral_centroid: float = Field(ge=0, description="Centro de masa espectral en Hz.")
    spectral_rolloff: float = Field(ge=0, description="Frecuencia de corte al 85% de energía (Hz).")
    zero_crossing_rate: float = Field(ge=0, description="Tasa de cruces por cero.")

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "timestamp": "2025-06-16T16:36:00",
                "filename": "Rec 2025-06-16 16h36m00s 1.wav",
                "duration": 120.0,
                "sampleRate": 48000,
                "isStereo": True,
                "dbfsLevel": -18.42,
                "rmsEnergy": 0.1198,
                "leqDbfs": -21.07,
                "chLeftDbfs": -18.91,
                "chRightDbfs": -19.34,
                "chLeftRms": 0.1134,
                "chRightRms": 0.1079,
                "ildDb": 0.43,
                "interauralCorrelation": 0.8712,
                "dominantFrequency": 125.0,
                "spectralCentroid": 1842.5,
                "spectralRolloff": 4210.3,
                "zeroCrossingRate": 0.0421,
            }
        }
    )


class IngestResponse(BaseModel):
    """Respuesta devuelta por el endpoint POST /ingest."""
    status: str
    message: str
    station_code: str
    recorded_at: datetime
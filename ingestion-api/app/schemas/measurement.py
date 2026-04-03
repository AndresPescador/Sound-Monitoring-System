from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

BOGOTA_TZ = timezone(timedelta(hours=-5))


class MeasurementPayload(BaseModel):
    """
    Modelo de validación del JSON enviado por la estación.
    Acepta camelCase en el JSON entrante y lo mapea a snake_case.

    Manejo de timezone:
    - process_audio.py genera timestamps naive ("2026-03-19T10:59:41").
    - Si el timestamp llega sin zona horaria, se asume hora de Bogotá (UTC-5)
      y se convierte a UTC para almacenamiento consistente en la base de datos.
    - Si llega con zona horaria explícita, se respeta tal cual.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    # ── Meta ──────────────────────────────────────────────────────────────────
    timestamp: datetime = Field(description="Inicio del fragmento de grabación.")
    filename:  str      = Field(description="Nombre del archivo .wav procesado.")
    duration:  float    = Field(ge=0, description="Duración en segundos.")
    sample_rate: int    = Field(gt=0, description="Frecuencia de muestreo en Hz.")
    is_stereo: bool     = Field(description="True si el archivo tenía dos canales.")

    # ── Nivel global ──────────────────────────────────────────────────────────
    dbfs_level:  float = Field(description="Nivel RMS del mix mono en dBFS.")
    rms_energy:  float = Field(ge=0, description="Energía RMS (0.0 – 1.0).")
    leq_dbfs:    float = Field(description="Leq con ponderación A en dBFS.")

    # ── Por canal ─────────────────────────────────────────────────────────────
    ch_left_dbfs:  float = Field(description="Nivel dBFS canal izquierdo.")
    ch_right_dbfs: float = Field(description="Nivel dBFS canal derecho.")
    ch_left_rms:   float = Field(ge=0, description="RMS canal izquierdo.")
    ch_right_rms:  float = Field(ge=0, description="RMS canal derecho.")

    # ── Binaural ──────────────────────────────────────────────────────────────
    ild_db:                 float = Field(description="Diferencia de nivel interaural en dB.")
    interaural_correlation: float = Field(ge=-1.0, le=1.0, description="Correlación entre canales.")

    # ── Espectral ─────────────────────────────────────────────────────────────
    dominant_frequency: float = Field(ge=0, description="Frecuencia dominante en Hz.")
    spectral_centroid:  float = Field(ge=0, description="Centro de masa espectral en Hz.")
    spectral_rolloff:   float = Field(ge=0, description="Frecuencia de corte al 85% de energía.")
    zero_crossing_rate: float = Field(ge=0, description="Tasa de cruces por cero.")

    @field_validator("timestamp", mode="after")
    @classmethod
    def ensure_timezone(cls, v: datetime) -> datetime:
        """
        Si el timestamp llega sin zona horaria (naive), asume que es hora de Bogotá (UTC-5)
        """
        if v.tzinfo is None:
            result = v.replace(tzinfo=BOGOTA_TZ)
            return result
        return v 


class IngestResponse(BaseModel):
    status:      str
    message:     str
    station_code: str
    recorded_at: datetime
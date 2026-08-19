from datetime import datetime
from pydantic import BaseModel


class MeasurementPoint(BaseModel):
    """Un punto en una serie temporal de acoustic_measurements."""
    recorded_at: datetime
    dbfs_level: float
    rms_energy: float
    leq_dbfs: float
    ch_left_dbfs: float
    ch_right_dbfs: float
    ild_db: float
    interaural_correlation: float
    dominant_frequency: float
    spectral_centroid: float
    spectral_rolloff: float
    zero_crossing_rate: float


class TimeSeriesResponse(BaseModel):
    """Serie completa o resumida para gráfica de línea."""
    station_code: str
    metric: str
    from_: datetime
    to: datetime
    count: int
    returned_count: int
    total_count: int
    has_more: bool = False
    is_aggregated: bool = False
    resolution_seconds: int | None = None
    data: list[dict]   # [{ "recorded_at": ..., "value": ... }]


class BinauralPoint(BaseModel):
    """Punto de métricas binaurales."""
    recorded_at: datetime
    ild_db: float
    interaural_correlation: float


class SpectralPoint(BaseModel):
    """Punto de métricas espectrales."""
    recorded_at: datetime
    dominant_frequency: float
    spectral_centroid: float
    spectral_rolloff: float
    zero_crossing_rate: float

from datetime import datetime
from pydantic import BaseModel


class HourlyPoint(BaseModel):
    """Una hora de agregación — para gráfica de banda L10/L50/L90."""
    hour_start: datetime
    leq_hour: float
    l10: float
    l50: float
    l90: float
    dbfs_min: float
    dbfs_max: float
    dbfs_avg: float
    measurement_count: int
    avg_dominant_frequency: float | None = None
    avg_spectral_centroid: float | None = None
    avg_spectral_rolloff: float | None = None
    avg_zero_crossing_rate: float | None = None
    avg_ild_db: float | None = None
    avg_interaural_corr: float | None = None


class HourlyResponse(BaseModel):
    """Serie de agregaciones horarias para gráfica de banda."""
    station_code: str
    from_: datetime
    to: datetime
    data: list[HourlyPoint]


class DailyProfilePoint(BaseModel):
    """Una hora del perfil diario — para gráfica de barras de 24h."""
    hour: int           # 0-23
    hour_start: datetime
    leq_hour: float
    l10: float
    l50: float
    l90: float
    measurement_count: int


class DailyProfileResponse(BaseModel):
    """Perfil diario (24 horas) para gráfica de barras."""
    station_code: str
    date: str
    data: list[DailyProfilePoint]


class CompareSeriesItem(BaseModel):
    """Serie de una estación para la gráfica de comparación."""
    station_code: str
    locality: str
    data: list[dict]    # [{ "hour_start": ..., "value": ... }]


class CompareResponse(BaseModel):
    """Comparación de una métrica entre múltiples estaciones."""
    metric: str
    from_: datetime
    to: datetime
    series: list[CompareSeriesItem]


class SystemStats(BaseModel):
    """Estadísticas globales del sistema para el panel principal."""
    active_stations: int
    total_stations: int
    total_measurements: int
    total_hourly_aggregations: int
    last_measurement_received_at: datetime | None
    stations_summary: list[dict]  # station_code, last_seen_at, measurement_count

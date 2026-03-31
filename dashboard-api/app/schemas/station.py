from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class StationOut(BaseModel):
    """Estación con su nivel de ruido actual para el mapa."""
    id: UUID
    station_code: str
    name: str
    locality: str
    address: str | None
    latitude: float
    longitude: float
    is_active: bool
    last_seen_at: datetime | None
    # Último leq_dbfs registrado (del fragmento más reciente)
    current_leq_dbfs: float | None
    # Nivel de alerta calculado en el backend: "low" | "moderate" | "high"
    noise_level: str | None


class StationSummary(BaseModel):
    """Resumen detallado de una estación para su tarjeta en el dashboard."""
    station_code: str
    name: str
    locality: str
    is_active: bool
    last_seen_at: datetime | None
    # Último fragmento recibido
    latest_leq_dbfs: float | None
    latest_dbfs_level: float | None
    latest_recorded_at: datetime | None
    # Agregación de la última hora completa
    last_hour_leq: float | None
    last_hour_l10: float | None
    last_hour_l50: float | None
    last_hour_l90: float | None
    last_hour_measurement_count: int | None
    # Total de mediciones en la base de datos para esta estación
    total_measurements: int

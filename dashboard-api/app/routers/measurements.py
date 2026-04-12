from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any

from app.database import get_db
from app.schemas.measurement import TimeSeriesResponse

router = APIRouter(prefix="/stations", tags=["measurements"])

# Métricas disponibles para la serie temporal
ALLOWED_METRICS = {
    "leq_dbfs", "dbfs_level", "rms_energy",
    "ch_left_dbfs", "ch_right_dbfs",
    "ild_db", "interaural_correlation",
    "dominant_frequency", "spectral_centroid",
    "spectral_rolloff", "zero_crossing_rate",
}

class RawMeasurementsResponse(BaseModel):
    """Schema para respuesta de mediciones crudas con todos los campos."""
    station_code: str
    count: int
    data: List[Dict[str, Any]]


@router.get("/{station_code}/measurements/raw", response_model=RawMeasurementsResponse)
async def get_measurements_raw(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=10000),
    db: AsyncSession = Depends(get_db)
):
    """
    Devuelve TODAS las columnas de acoustic_measurements para una estación y rango.
    
    Ejemplo: GET /stations/ST001/measurements/raw?from=2026-03-29T00:00:00Z&to=2026-03-29T23:59:59Z&limit=5000
    """
    now = datetime.now(timezone.utc)
    if to is None:
        to = now
    if from_ is None:
        from_ = now - timedelta(hours=24)

    # Verificar que la estación existe
    check = await db.execute(
        text("SELECT id FROM stations WHERE station_code = :code"),
        {"code": station_code}
    )
    station = check.fetchone()
    if not station:
        raise HTTPException(status_code=404, detail=f"Estación no encontrada: {station_code}")

    # Query para obtener todas las columnas
    sql = text("""
        SELECT
            recorded_at,
            dbfs_level,
            rms_energy,
            leq_dbfs,
            ch_left_dbfs,
            ch_right_dbfs,
            ch_left_rms,
            ch_right_rms,
            ild_db,
            interaural_correlation,
            dominant_frequency,
            spectral_centroid,
            spectral_rolloff,
            zero_crossing_rate,
            duration,
            sample_rate,
            is_stereo
        FROM acoustic_measurements
        WHERE station_id = :station_id
          AND recorded_at >= :from_
          AND recorded_at <= :to
        ORDER BY recorded_at ASC
        LIMIT :limit
    """)
    
    result = await db.execute(sql, {
        "station_id": station[0],
        "from_": from_,
        "to": to,
        "limit": limit
    })
    rows = result.mappings().all()

    return RawMeasurementsResponse(
        station_code=station_code,
        count=len(rows),
        data=[dict(r) for r in rows]
    )


@router.get("/{station_code}/measurements", response_model=TimeSeriesResponse)
async def get_measurements(
    station_code: str,
    metric: str = Query(default="leq_dbfs", description=f"Métrica a graficar. Opciones: {', '.join(sorted(ALLOWED_METRICS))}"),
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=1500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db)
):
    """
    Serie temporal de mediciones crudas de acoustic_measurements.
    Alimenta la gráfica de línea con resolución de ~2 minutos.

    El parámetro 'metric' define qué columna se devuelve como 'value'.
    Ejemplo: ?metric=leq_dbfs&from=2026-03-29T00:00:00&to=2026-03-29T23:59:59
    """
    if metric not in ALLOWED_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_METRICS)}"
        )

    now = datetime.now(timezone.utc)
    if to is None:
        to = now
    if from_ is None:
        from_ = now - timedelta(hours=24)

    # Verificar estación
    check = await db.execute(
        text("SELECT id FROM stations WHERE station_code = :code"),
        {"code": station_code}
    )
    station = check.fetchone()
    if not station:
        raise HTTPException(status_code=404, detail=f"Estación no encontrada: {station_code}")

    # La columna se valida contra ALLOWED_METRICS arriba, es seguro interpolarla
    sql = text(f"""
        SELECT
            recorded_at,
            {metric} AS value
        FROM acoustic_measurements
        WHERE station_id = :station_id
          AND recorded_at >= :from_
          AND recorded_at <= :to
        ORDER BY recorded_at ASC
        LIMIT :limit
    """)

    result = await db.execute(sql, {
        "station_id": station[0],
        "from_": from_,
        "to": to,
        "limit": limit
    })
    rows = result.mappings().all()

    data = [{"recorded_at": row["recorded_at"], "value": row["value"]} for row in rows]

    return TimeSeriesResponse(
        station_code=station_code,
        metric=metric,
        from_=from_,
        to=to,
        count=len(data),
        data=data
    )

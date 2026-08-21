from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.series_utils import (
    DEFAULT_CHART_POINTS,
    MAX_CHART_POINTS,
    count_measurements,
    fetch_adaptive_metric,
    get_station_id,
    normalize_datetime,
    resolve_range,
)
from app.schemas.measurement import TimeSeriesResponse


router = APIRouter(prefix="/stations", tags=["measurements"])

ALLOWED_METRICS = {
    "leq_dbfs", "dbfs_level", "rms_energy",
    "ch_left_dbfs", "ch_right_dbfs",
    "ild_db", "interaural_correlation",
    "dominant_frequency", "spectral_centroid",
    "spectral_rolloff", "zero_crossing_rate",
}


class RawMeasurementsResponse(BaseModel):
    """Página exacta de mediciones crudas, con metadata de paginación."""
    station_code: str
    count: int
    returned_count: int
    total_count: int
    has_more: bool
    next_cursor: datetime | None = None
    data: List[Dict[str, Any]]


@router.get("/{station_code}/measurements/raw", response_model=RawMeasurementsResponse)
async def get_measurements_raw(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=1000),
    cursor: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve mediciones exactas por páginas usando un cursor temporal."""
    from_, to = resolve_range(from_, to)
    station_id = await get_station_id(db, station_code)
    total_count = await count_measurements(db, station_id, from_, to)

    cursor_filter = ""
    params = {
        "station_id": station_id,
        "from_": from_,
        "to": to,
        "limit": limit + 1,
    }
    if cursor is not None:
        cursor = normalize_datetime(cursor)
        if cursor < from_ or cursor >= to:
            raise HTTPException(
                status_code=422,
                detail="El cursor debe estar dentro del rango solicitado.",
            )
        cursor_filter = "AND recorded_at > :cursor"
        params["cursor"] = cursor

    result = await db.execute(
        text(f"""
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
              {cursor_filter}
            ORDER BY recorded_at ASC
            LIMIT :limit
        """),
        params,
    )
    rows = [dict(row) for row in result.mappings().all()]
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = page[-1]["recorded_at"] if has_more and page else None

    return RawMeasurementsResponse(
        station_code=station_code,
        count=len(page),
        returned_count=len(page),
        total_count=total_count,
        has_more=has_more,
        next_cursor=next_cursor,
        data=page,
    )


@router.get("/{station_code}/measurements", response_model=TimeSeriesResponse)
async def get_measurements(
    station_code: str,
    metric: str = Query(
        default="leq_dbfs",
        description=f"Métrica a graficar. Opciones: {', '.join(sorted(ALLOWED_METRICS))}",
    ),
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=DEFAULT_CHART_POINTS, ge=100, le=MAX_CHART_POINTS),
    db: AsyncSession = Depends(get_db),
):
    """
    Serie para gráfica con resolución adaptativa.

    Si el rango tiene pocos registros, devuelve cada medición. Si supera el
    límite visual, devuelve ventanas temporales con promedio, mínimo, máximo y
    cantidad de mediciones fuente, sin recortar el intervalo consultado.
    """
    if metric not in ALLOWED_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_METRICS)}",
        )

    from_, to = resolve_range(from_, to)
    station_id = await get_station_id(db, station_code)
    data, total_count, is_aggregated, resolution_seconds = await fetch_adaptive_metric(
        db, station_id, from_, to, metric, limit
    )

    return TimeSeriesResponse(
        station_code=station_code,
        metric=metric,
        from_=from_,
        to=to,
        count=len(data),
        returned_count=len(data),
        total_count=total_count,
        has_more=False,
        is_aggregated=is_aggregated,
        resolution_seconds=resolution_seconds,
        data=data,
    )

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers.series_utils import (
    DEFAULT_CHART_POINTS,
    MAX_CHART_POINTS,
    fetch_adaptive_columns,
    get_station_id,
    resolve_range,
)


router = APIRouter(prefix="/stations", tags=["binaural"])


@router.get("/{station_code}/binaural")
async def get_binaural(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=DEFAULT_CHART_POINTS, ge=100, le=MAX_CHART_POINTS),
    db: AsyncSession = Depends(get_db),
):
    """Métricas binaurales con resolución adaptativa y metadata de cobertura."""
    from_, to = resolve_range(from_, to)
    station_id = await get_station_id(db, station_code)
    data, total_count, is_aggregated, resolution_seconds = await fetch_adaptive_columns(
        db,
        station_id,
        from_,
        to,
        ["ild_db", "interaural_correlation"],
        limit,
    )

    return {
        "station_code": station_code,
        "from_": from_,
        "to": to,
        "count": len(data),
        "returned_count": len(data),
        "total_count": total_count,
        "has_more": False,
        "is_aggregated": is_aggregated,
        "resolution_seconds": resolution_seconds,
        "data": data,
    }

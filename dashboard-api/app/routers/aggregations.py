from datetime import date, datetime, time, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db
from app.routers.series_utils import get_station_id, resolve_range
from app.schemas.aggregation import HourlyResponse, HourlyPoint, DailyProfileResponse, DailyProfilePoint

router = APIRouter(prefix="/stations", tags=["aggregations"])
BOGOTA = ZoneInfo("America/Bogota")


@router.get("/{station_code}/hourly", response_model=HourlyResponse)
async def get_hourly(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    db: AsyncSession = Depends(get_db)
):
    """
    Agregaciones horarias de hourly_aggregations: Leq, L10, L50, L90.
    Alimenta la gráfica de banda donde:
      - L90 = área de fondo (ruido base)
      - L50 = línea del nivel típico
      - L10 = área de picos (eventos ruidosos)

    Recharts: usar AreaChart con tres Area apiladas (L10, L50, L90).
    """
    from_, to = resolve_range(from_, to)
    station_id = await get_station_id(db, station_code)

    sql = text("""
        SELECT
            hour_start,
            leq_hour,
            l10,
            l50,
            l90,
            dbfs_min,
            dbfs_max,
            dbfs_avg,
            measurement_count,
            avg_dominant_frequency,
            avg_spectral_centroid,
            avg_spectral_rolloff,
            avg_zero_crossing_rate,
            avg_ild_db,
            avg_interaural_corr
        FROM hourly_aggregations
        WHERE station_id = :station_id
          AND hour_start >= :from_
          AND hour_start <= :to
        ORDER BY hour_start ASC
        LIMIT 750
    """)
    result = await db.execute(sql, {
        "station_id": station_id,
        "from_": from_,
        "to": to
    })
    rows = result.mappings().all()

    return HourlyResponse(
        station_code=station_code,
        from_=from_,
        to=to,
        data=[HourlyPoint(**dict(row)) for row in rows]
    )


@router.get("/{station_code}/daily-profile", response_model=DailyProfileResponse)
async def get_daily_profile(
    station_code: str,
    date_: date = Query(default=None, alias="date",
                        description="Fecha en formato YYYY-MM-DD. Por defecto: hoy."),
    db: AsyncSession = Depends(get_db)
):
    """
    Perfil de ruido de las 24 horas de un día específico.
    Alimenta la gráfica de barras donde el eje X son las horas (0-23)
    y el eje Y es el Leq de cada hora.

    Permite identificar horas pico (tráfico matutino, actividad comercial)
    y horas silenciosas (madrugada).

    Recharts: usar BarChart con XAxis dataKey="hour".
    """
    if date_ is None:
        date_ = datetime.now(BOGOTA).date()
    if date_ > datetime.now(BOGOTA).date():
        raise HTTPException(status_code=422, detail="La fecha no puede estar en el futuro.")

    station_id = await get_station_id(db, station_code)
    day_start = datetime.combine(date_, time.min, tzinfo=BOGOTA).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)

    sql = text("""
        SELECT
            EXTRACT(HOUR FROM hour_start AT TIME ZONE 'America/Bogota')::int AS hour,
            hour_start,
            leq_hour,
            l10,
            l50,
            l90,
            measurement_count
        FROM hourly_aggregations
        WHERE station_id = :station_id
          AND hour_start >= :day_start
          AND hour_start < :day_end
        ORDER BY hour_start ASC
    """)
    result = await db.execute(sql, {
        "station_id": station_id,
        "day_start": day_start,
        "day_end": day_end,
    })
    rows = result.mappings().all()

    return DailyProfileResponse(
        station_code=station_code,
        date=str(date_),
        data=[DailyProfilePoint(**dict(row)) for row in rows]
    )

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.database import get_db
from app.routers.series_utils import get_station_id
from app.schemas.station import StationOut, StationSummary

router = APIRouter(prefix="/stations", tags=["stations"])


def _noise_level(leq: float | None) -> str | None:
    """Clasifica el nivel de ruido para el color del marcador en el mapa."""
    if leq is None:
        return None
    if leq < -30:
        return "low"
    if leq < -20:
        return "moderate"
    return "high"


@router.get("", response_model=list[StationOut])
async def list_stations(db: AsyncSession = Depends(get_db)):
    """
    Lista todas las estaciones con su nivel de ruido actual.
    Alimenta el mapa interactivo de Bogotá.

    El nivel actual se obtiene del último registro en acoustic_measurements
    para cada estación, usando DISTINCT ON para una sola consulta eficiente.
    """
    sql = text("""
        SELECT
            s.id,
            s.station_code,
            s.name,
            s.locality,
            s.address,
            s.latitude,
            s.longitude,
            s.is_active,
            s.last_seen_at,
            latest.leq_dbfs AS current_leq_dbfs
        FROM stations s
        LEFT JOIN LATERAL (
            SELECT leq_dbfs
            FROM acoustic_measurements
            WHERE station_id = s.id
            ORDER BY recorded_at DESC
            LIMIT 1
        ) latest ON true
        ORDER BY s.locality, s.station_code
    """)
    result = await db.execute(sql)
    rows = result.mappings().all()

    return [
        StationOut(
            **dict(row),
            noise_level=_noise_level(row["current_leq_dbfs"])
        )
        for row in rows
    ]


@router.get("/{station_code}/summary", response_model=StationSummary)
async def station_summary(station_code: str, db: AsyncSession = Depends(get_db)):
    """
    Resumen completo de una estación:
    - Último fragmento recibido
    - Agregación de la última hora
    - Total de mediciones históricas

    Alimenta la tarjeta de detalle de una estación en el dashboard.
    """
    # Verificar que existe
    await get_station_id(db, station_code)

    sql = text("""
        WITH station AS (
            SELECT id, station_code, name, locality, is_active, last_seen_at
            FROM stations
            WHERE station_code = :code
        ),
        latest_measurement AS (
            SELECT leq_dbfs, dbfs_level, recorded_at
            FROM acoustic_measurements
            WHERE station_id = (SELECT id FROM station)
            ORDER BY recorded_at DESC
            LIMIT 1
        ),
        last_hour AS (
            SELECT leq_hour, l10, l50, l90, measurement_count
            FROM hourly_aggregations
            WHERE station_id = (SELECT id FROM station)
            ORDER BY hour_start DESC
            LIMIT 1
        ),
        total AS (
            SELECT COALESCE(SUM(measurement_count), 0) AS total_measurements
            FROM hourly_aggregations
            WHERE station_id = (SELECT id FROM station)
        )
        SELECT
            s.station_code, s.name, s.locality, s.is_active, s.last_seen_at,
            lm.leq_dbfs       AS latest_leq_dbfs,
            lm.dbfs_level     AS latest_dbfs_level,
            lm.recorded_at    AS latest_recorded_at,
            lh.leq_hour       AS last_hour_leq,
            lh.l10            AS last_hour_l10,
            lh.l50            AS last_hour_l50,
            lh.l90            AS last_hour_l90,
            lh.measurement_count AS last_hour_measurement_count,
            t.total_measurements
        FROM station s
        LEFT JOIN latest_measurement lm ON true
        LEFT JOIN last_hour lh ON true
        LEFT JOIN total t ON true
    """)
    result = await db.execute(sql, {"code": station_code})
    row = result.mappings().fetchone()
    return StationSummary(**dict(row))

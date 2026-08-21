from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends

from app.database import get_db
from app.schemas.aggregation import SystemStats

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/stats", response_model=SystemStats)
async def system_stats(db: AsyncSession = Depends(get_db)):
    """
    Estadísticas globales del sistema.
    Alimenta el panel de resumen (cards) de la página principal del dashboard:
    - Total de estaciones activas e inactivas
    - Total de mediciones en la base de datos
    - Última medición recibida
    - Resumen por estación (para tabla de estado)
    """
    # hourly_aggregations se recalcula tras cada ingesta. Usarla evita varios
    # escaneos completos de acoustic_measurements en esta ruta pública.
    result = await db.execute(text("""
        WITH station_rollup AS (
            SELECT
                station_id,
                SUM(measurement_count)::bigint AS measurement_count,
                MAX(leq_hour) AS max_leq,
                SUM(leq_hour * measurement_count)
                    / NULLIF(SUM(measurement_count), 0) AS avg_leq
            FROM hourly_aggregations
            GROUP BY station_id
        ), totals AS (
            SELECT
                COUNT(*) AS total_hourly_aggregations,
                COALESCE(SUM(measurement_count), 0)::bigint AS total_measurements
            FROM hourly_aggregations
        )
        SELECT
            s.station_code,
            s.locality,
            s.is_active,
            s.last_seen_at,
            COALESCE(sr.measurement_count, 0) AS measurement_count,
            sr.max_leq,
            sr.avg_leq,
            COUNT(*) OVER () AS total_stations,
            COUNT(*) FILTER (WHERE s.is_active) OVER () AS active_stations,
            totals.total_measurements,
            totals.total_hourly_aggregations,
            MAX(s.last_seen_at) OVER () AS last_measurement_received_at
        FROM stations s
        LEFT JOIN station_rollup sr ON sr.station_id = s.id
        CROSS JOIN totals
        ORDER BY s.station_code
    """))
    summary_rows = [dict(row) for row in result.mappings().all()]
    first = summary_rows[0] if summary_rows else {}

    return SystemStats(
        active_stations=first.get("active_stations", 0),
        total_stations=first.get("total_stations", 0),
        total_measurements=first.get("total_measurements", 0),
        total_hourly_aggregations=first.get("total_hourly_aggregations", 0),
        last_measurement_received_at=first.get("last_measurement_received_at"),
        stations_summary=[{
            key: row[key]
            for key in (
                "station_code", "locality", "is_active", "last_seen_at",
                "measurement_count", "max_leq", "avg_leq",
            )
        } for row in summary_rows],
    )

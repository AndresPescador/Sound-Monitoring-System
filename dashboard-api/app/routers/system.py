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
    sql = text("""
        SELECT
            COUNT(*) FILTER (WHERE is_active = true)  AS active_stations,
            COUNT(*)                                    AS total_stations
        FROM stations
    """)
    counts = (await db.execute(sql)).mappings().fetchone()

    total_m = (await db.execute(
        text("SELECT COUNT(*) AS total FROM acoustic_measurements")
    )).scalar()

    total_h = (await db.execute(
        text("SELECT COUNT(*) AS total FROM hourly_aggregations")
    )).scalar()

    last_received = (await db.execute(
        text("SELECT MAX(received_at) FROM acoustic_measurements")
    )).scalar()

    # Resumen por estación: código, última vez visto, total mediciones
    summary_sql = text("""
        SELECT
            s.station_code,
            s.locality,
            s.is_active,
            s.last_seen_at,
            COUNT(m.id) AS measurement_count,
            MAX(m.leq_dbfs) AS max_leq,
            AVG(m.leq_dbfs) AS avg_leq
        FROM stations s
        LEFT JOIN acoustic_measurements m ON m.station_id = s.id
        GROUP BY s.station_code, s.locality, s.is_active, s.last_seen_at
        ORDER BY s.station_code
    """)
    summary_rows = (await db.execute(summary_sql)).mappings().all()

    return SystemStats(
        active_stations=counts["active_stations"],
        total_stations=counts["total_stations"],
        total_measurements=total_m or 0,
        total_hourly_aggregations=total_h or 0,
        last_measurement_received_at=last_received,
        stations_summary=[dict(row) for row in summary_rows]
    )

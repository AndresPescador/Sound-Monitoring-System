from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db

router = APIRouter(prefix="/stations", tags=["binaural"])


@router.get("/{station_code}/binaural")
async def get_binaural(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db)
):
    """
    Métricas binaurales: ILD e correlación interaural en el tiempo.
    Extraídas de acoustic_measurements.

    Visualizaciones sugeridas en Recharts:
    - ILD (ild_db): BarChart con barra centrada en 0.
        Positivo (+) = predominio izquierdo.
        Negativo (-) = predominio derecho.
        Permite ver de qué lado viene el ruido.
    - Correlación interaural: LineChart entre -1 y 1.
        Cercano a +1 = campo difuso / sonido frontal.
        Cercano a 0  = fuente lateral definida.
    """
    now = datetime.now(timezone.utc)
    if to is None:
        to = now
    if from_ is None:
        from_ = now - timedelta(hours=24)

    check = await db.execute(
        text("SELECT id FROM stations WHERE station_code = :code"),
        {"code": station_code}
    )
    station = check.fetchone()
    if not station:
        raise HTTPException(status_code=404, detail=f"Estación no encontrada: {station_code}")

    sql = text("""
        SELECT
            recorded_at,
            ild_db,
            interaural_correlation
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

    return {
        "station_code": station_code,
        "from_": from_,
        "to": to,
        "count": len(rows),
        "data": [dict(row) for row in rows]
    }

from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db

router = APIRouter(prefix="/stations", tags=["spectral"])


@router.get("/{station_code}/spectral")
async def get_spectral(
    station_code: str,
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db)
):
    """
    Métricas espectrales en el tiempo: frecuencia dominante, centroide,
    rolloff y tasa de cruces por cero.
    Extraídas de acoustic_measurements.

    Visualizaciones sugeridas en Recharts:
    - spectral_centroid: LineChart en Hz. Valores altos = sonido brillante/agudo
      (bocinas, voces). Valores bajos = graves (tráfico pesado, maquinaria).
    - dominant_frequency: LineChart en Hz. Muestra la frecuencia predominante
      del período (útil para identificar tipo de fuente sonora).
    - zero_crossing_rate: LineChart. Valores altos = ruido (no tonal).
      Valores bajos = sonido tonal (motores constantes, zumbidos).
    - spectral_rolloff: LineChart en Hz. Punto bajo del espectro de energía.
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
            dominant_frequency,
            spectral_centroid,
            spectral_rolloff,
            zero_crossing_rate
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

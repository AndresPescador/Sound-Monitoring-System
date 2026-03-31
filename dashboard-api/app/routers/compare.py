from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, Query

from app.database import get_db
from app.schemas.aggregation import CompareResponse, CompareSeriesItem

router = APIRouter(prefix="/compare", tags=["compare"])

ALLOWED_COMPARE_METRICS = {
    "leq_hour", "l10", "l50", "l90",
    "dbfs_avg", "dbfs_max",
    "avg_spectral_centroid", "avg_ild_db", "avg_interaural_corr"
}


@router.get("", response_model=CompareResponse)
async def compare_stations(
    metric: str = Query(default="leq_hour",
                        description=f"Métrica a comparar. Opciones: {', '.join(sorted(ALLOWED_COMPARE_METRICS))}"),
    stations: str = Query(default=None,
                          description="Códigos de estaciones separados por coma. Si no se indica, se usan todas."),
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    db: AsyncSession = Depends(get_db)
):
    """
    Compara una métrica de hourly_aggregations entre múltiples estaciones.

    Alimenta la gráfica de líneas múltiples donde cada línea es una estación.
    Permite identificar qué localidades tienen mayor ruido en un período.

    Si no se especifican estaciones, devuelve todas las activas.
    Recharts: LineChart con una Line por cada elemento de 'series'.

    Ejemplo de respuesta:
    {
      "series": [
        { "station_code": "ST-CHAPINERO-01", "locality": "Chapinero",
          "data": [{"hour_start": "...", "value": -21.3}, ...] },
        { "station_code": "ST-USAQUEN-01", "locality": "Usaquén",
          "data": [{"hour_start": "...", "value": -24.1}, ...] }
      ]
    }
    """
    if metric not in ALLOWED_COMPARE_METRICS:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_COMPARE_METRICS)}"
        )

    now = datetime.now(timezone.utc)
    if to is None:
        to = now
    if from_ is None:
        from_ = now - timedelta(hours=24)

    # Filtrar por estaciones específicas o traer todas las activas
    station_filter = ""
    params: dict = {"from_": from_, "to": to}

    if stations:
        codes = [s.strip() for s in stations.split(",") if s.strip()]
        params["codes"] = codes
        station_filter = "AND s.station_code = ANY(:codes)"

    sql = text(f"""
        SELECT
            s.station_code,
            s.locality,
            ha.hour_start,
            ha.{metric} AS value
        FROM hourly_aggregations ha
        JOIN stations s ON s.id = ha.station_id
        WHERE ha.hour_start >= :from_
          AND ha.hour_start <= :to
          AND s.is_active = true
          {station_filter}
        ORDER BY s.station_code, ha.hour_start ASC
    """)

    result = await db.execute(sql, params)
    rows = result.mappings().all()

    # Agrupar por estación
    series_map: dict[str, CompareSeriesItem] = {}
    for row in rows:
        code = row["station_code"]
        if code not in series_map:
            series_map[code] = CompareSeriesItem(
                station_code=code,
                locality=row["locality"],
                data=[]
            )
        series_map[code].data.append({
            "hour_start": row["hour_start"],
            "value": row["value"]
        })

    return CompareResponse(
        metric=metric,
        from_=from_,
        to=to,
        series=list(series_map.values())
    )

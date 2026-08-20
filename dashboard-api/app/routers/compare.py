from datetime import datetime
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db
from app.routers.measurements import ALLOWED_METRICS
from app.routers.series_utils import (
    DEFAULT_CHART_POINTS,
    MAX_CHART_POINTS,
    _bucket_interval,
    bucket_seconds,
    resolve_range,
)
from app.schemas.aggregation import (
    CompareMeasurementsResponse,
    CompareRawMeasurementsResponse,
    CompareResponse,
    CompareSeriesItem,
)

router = APIRouter(prefix="/compare", tags=["compare"])

ALLOWED_COMPARE_METRICS = {
    "leq_hour", "l10", "l50", "l90",
    "dbfs_avg", "dbfs_max",
    "avg_spectral_centroid", "avg_ild_db", "avg_interaural_corr"
}

DEFAULT_RAW_COMPARE_POINTS = 10000
MAX_RAW_COMPARE_POINTS = 10000


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
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_COMPARE_METRICS)}"
        )

    # ``to`` es inclusivo en todos los endpoints públicos de series. El mismo
    # normalizador se usa para los endpoints de mediciones y datos crudos.
    from_, to = resolve_range(from_, to)

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


@router.get("/measurements", response_model=CompareMeasurementsResponse)
async def compare_measurements(
    metric: str = Query(
        default="leq_dbfs",
        description=f"Métrica de mediciones. Opciones: {', '.join(sorted(ALLOWED_METRICS))}",
    ),
    stations: str = Query(
        default=None,
        description="Códigos de estaciones separados por coma. Si no se indica, se usan todas las activas.",
    ),
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    max_points: int = Query(default=DEFAULT_CHART_POINTS, ge=100, le=MAX_CHART_POINTS),
    db: AsyncSession = Depends(get_db),
):
    """
    Compara mediciones usando un grid temporal común.

    ``data`` usa los mismos buckets para todas las estaciones, por lo que sus
    líneas sí comparten las posiciones del eje X. Los timestamps originales
    para el ScatterChart se cargan bajo demanda en ``/measurements/raw``.
    """
    if metric not in ALLOWED_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_METRICS)}",
        )

    from_, to = resolve_range(from_, to)
    station_filter = ""
    station_params: dict = {}
    if stations:
        codes = [code.strip() for code in stations.split(",") if code.strip()]
        station_filter = "AND station_code = ANY(:codes)"
        station_params["codes"] = codes

    station_result = await db.execute(
        text(f"""
            SELECT id, station_code, locality
            FROM stations
            WHERE is_active = true
              {station_filter}
            ORDER BY station_code ASC
        """),
        station_params,
    )
    station_rows = [dict(row) for row in station_result.mappings().all()]
    station_ids = [row["id"] for row in station_rows]

    if not station_rows:
        return CompareMeasurementsResponse(
            metric=metric,
            from_=from_,
            to=to,
            resolution_seconds=bucket_seconds(from_, to, max_points),
            bucket_count=0,
            total_count=0,
            series=[],
        )

    seconds = bucket_seconds(from_, to, max_points)
    interval = _bucket_interval()
    params = {
        "station_ids": station_ids,
        "from_": from_,
        "to": to,
        "bucket_seconds": seconds,
    }

    count_result = await db.execute(
        text("""
            SELECT station_id, COUNT(*) AS total_count
            FROM acoustic_measurements
            WHERE station_id = ANY(:station_ids)
              AND recorded_at >= :from_
              AND recorded_at <= :to
            GROUP BY station_id
        """),
        params,
    )
    counts = {row["station_id"]: int(row["total_count"]) for row in count_result.mappings().all()}

    common_result = await db.execute(
        text(f"""
            WITH buckets AS (
                SELECT generate_series(
                    date_bin(
                        {interval},
                        CAST(:from_ AS timestamptz),
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ),
                    date_bin(
                        {interval},
                        CAST(:to AS timestamptz),
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ),
                    {interval}
                ) AS bucket_start
            ), grid AS (
                SELECT s.id AS station_id, s.station_code, s.locality, b.bucket_start
                FROM stations s
                CROSS JOIN buckets b
                WHERE s.id = ANY(:station_ids)
            ), aggregated AS (
                SELECT
                    station_id,
                    date_bin(
                        {interval},
                        recorded_at,
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ) AS bucket_start,
                    AVG({metric}) AS value,
                    MIN({metric}) AS value_min,
                    MAX({metric}) AS value_max,
                    COUNT(*) AS source_count
                FROM acoustic_measurements
                WHERE station_id = ANY(:station_ids)
                  AND recorded_at >= :from_
                  AND recorded_at <= :to
                GROUP BY station_id, bucket_start
            )
            SELECT
                grid.station_code,
                grid.locality,
                GREATEST(grid.bucket_start, CAST(:from_ AS timestamptz)) AS recorded_at,
                LEAST(grid.bucket_start + {interval}, CAST(:to AS timestamptz)) AS bucket_end,
                aggregated.value,
                aggregated.value_min,
                aggregated.value_max,
                aggregated.source_count
            FROM grid
            LEFT JOIN aggregated
              ON aggregated.station_id = grid.station_id
             AND aggregated.bucket_start = grid.bucket_start
            ORDER BY grid.station_code ASC, grid.bucket_start ASC
        """),
        params,
    )

    series_map = {
        row["station_code"]: {
            "station_code": row["station_code"],
            "locality": row["locality"],
            "data": [],
            "raw_data": [],
            "total_count": counts.get(row["id"], 0),
            "raw_returned_count": 0,
            "raw_has_more": False,
            "raw_sampled": False,
        }
        for row in station_rows
    }
    for row in common_result.mappings().all():
        series_map[row["station_code"]]["data"].append({
            "recorded_at": row["recorded_at"],
            "bucket_end": row["bucket_end"],
            "value": row["value"],
            "value_min": row["value_min"],
            "value_max": row["value_max"],
            "source_count": row["source_count"],
        })

    series = list(series_map.values())
    bucket_count = len(series[0]["data"]) if series else 0
    return CompareMeasurementsResponse(
        metric=metric,
        from_=from_,
        to=to,
        resolution_seconds=seconds,
        bucket_count=bucket_count,
        total_count=sum(item["total_count"] for item in series),
        series=series,
    )


@router.get("/measurements/raw", response_model=CompareRawMeasurementsResponse)
async def compare_raw_measurements(
    metric: str = Query(
        default="leq_dbfs",
        description=f"Métrica de mediciones. Opciones: {', '.join(sorted(ALLOWED_METRICS))}",
    ),
    stations: str = Query(
        default=None,
        description="Códigos de estaciones separados por coma. Si no se indica, se usan todas las activas.",
    ),
    from_: datetime = Query(default=None, alias="from"),
    to: datetime = Query(default=None),
    raw_limit: int = Query(default=DEFAULT_RAW_COMPARE_POINTS, ge=1, le=MAX_RAW_COMPARE_POINTS),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve puntos exactos para el ScatterChart, separados del grid agregado."""
    if metric not in ALLOWED_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Métrica '{metric}' no válida. Opciones: {sorted(ALLOWED_METRICS)}",
        )

    from_, to = resolve_range(from_, to)
    station_filter = ""
    station_params: dict = {}
    if stations:
        codes = [code.strip() for code in stations.split(",") if code.strip()]
        station_filter = "AND station_code = ANY(:codes)"
        station_params["codes"] = codes

    station_result = await db.execute(
        text(f"""
            SELECT id, station_code, locality
            FROM stations
            WHERE is_active = true
              {station_filter}
            ORDER BY station_code ASC
        """),
        station_params,
    )
    station_rows = [dict(row) for row in station_result.mappings().all()]
    station_ids = [row["id"] for row in station_rows]

    if not station_rows:
        return CompareRawMeasurementsResponse(
            metric=metric,
            from_=from_,
            to=to,
            total_count=0,
            raw_limit=raw_limit,
            series=[],
        )

    params = {
        "station_ids": station_ids,
        "from_": from_,
        "to": to,
    }
    count_result = await db.execute(
        text("""
            SELECT station_id, COUNT(*) AS total_count
            FROM acoustic_measurements
            WHERE station_id = ANY(:station_ids)
              AND recorded_at >= :from_
              AND recorded_at <= :to
            GROUP BY station_id
        """),
        params,
    )
    counts = {row["station_id"]: int(row["total_count"]) for row in count_result.mappings().all()}

    raw_result = await db.execute(
        text(f"""
            WITH bucketed AS (
                SELECT
                    am.station_id,
                    s.station_code,
                    s.locality,
                    am.recorded_at,
                    am.{metric} AS value,
                    NTILE(:raw_limit) OVER (
                        PARTITION BY am.station_id
                        ORDER BY am.recorded_at ASC
                    ) AS sample_bucket
                FROM acoustic_measurements am
                JOIN stations s ON s.id = am.station_id
                WHERE am.station_id = ANY(:station_ids)
                  AND am.recorded_at >= :from_
                  AND am.recorded_at <= :to
            )
            SELECT DISTINCT ON (station_code, sample_bucket)
                station_code,
                locality,
                recorded_at,
                value
            FROM bucketed
            ORDER BY station_code ASC, sample_bucket ASC, recorded_at ASC
        """),
        {**params, "raw_limit": raw_limit},
    )

    series_map = {
        row["station_code"]: {
            "station_code": row["station_code"],
            "locality": row["locality"],
            "raw_data": [],
            "total_count": counts.get(row["id"], 0),
            "raw_returned_count": 0,
            "raw_has_more": counts.get(row["id"], 0) > raw_limit,
            "raw_sampled": counts.get(row["id"], 0) > raw_limit,
        }
        for row in station_rows
    }
    # El resultado se ordena por código y fecha, igual que el grid común.
    for row in raw_result.mappings().all():
        item = series_map[row["station_code"]]
        item["raw_data"].append({
            "recorded_at": row["recorded_at"],
            "value": row["value"],
        })
        item["raw_returned_count"] += 1

    series = list(series_map.values())
    return CompareRawMeasurementsResponse(
        metric=metric,
        from_=from_,
        to=to,
        total_count=sum(item["total_count"] for item in series),
        raw_limit=raw_limit,
        series=series,
    )

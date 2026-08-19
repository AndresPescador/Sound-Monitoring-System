from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


DEFAULT_CHART_POINTS = 1500
MAX_CHART_POINTS = 3000
MIN_BUCKET_SECONDS = 60


def resolve_range(from_: datetime | None, to: datetime | None) -> tuple[datetime, datetime]:
    """Normaliza un intervalo de consulta y evita rangos invertidos."""
    now = datetime.now(timezone.utc)
    resolved_to = to or now
    resolved_from = from_ or (resolved_to - timedelta(hours=24))

    if resolved_to.tzinfo is None:
        resolved_to = resolved_to.replace(tzinfo=timezone.utc)
    if resolved_from.tzinfo is None:
        resolved_from = resolved_from.replace(tzinfo=timezone.utc)

    if resolved_from > resolved_to:
        raise HTTPException(
            status_code=422,
            detail="El inicio del rango no puede ser posterior al final.",
        )

    return resolved_from, resolved_to


async def get_station_id(db: AsyncSession, station_code: str):
    result = await db.execute(
        text("SELECT id FROM stations WHERE station_code = :code"),
        {"code": station_code},
    )
    station = result.fetchone()
    if not station:
        raise HTTPException(status_code=404, detail=f"Estación no encontrada: {station_code}")
    return station[0]


async def count_measurements(
    db: AsyncSession,
    station_id,
    from_: datetime,
    to: datetime,
) -> int:
    result = await db.execute(
        text("""
            SELECT COUNT(*)
            FROM acoustic_measurements
            WHERE station_id = :station_id
              AND recorded_at >= :from_
              AND recorded_at <= :to
        """),
        {"station_id": station_id, "from_": from_, "to": to},
    )
    return int(result.scalar_one() or 0)


def bucket_seconds(from_: datetime, to: datetime, max_points: int) -> int:
    duration = max((to - from_).total_seconds(), MIN_BUCKET_SECONDS)
    # generate_series incluye ambos extremos; dejamos un punto de margen para
    # que la respuesta nunca supere el máximo visual solicitado.
    effective_points = max(max_points - 1, 1)
    return max(MIN_BUCKET_SECONDS, ceil(duration / effective_points))


def _bucket_interval() -> str:
    return "make_interval(secs => CAST(:bucket_seconds AS double precision))"


async def fetch_adaptive_metric(
    db: AsyncSession,
    station_id,
    from_: datetime,
    to: datetime,
    metric: str,
    max_points: int,
) -> tuple[list[dict], int, bool, int | None]:
    """Devuelve puntos crudos o ventanas estadísticas según el volumen."""
    total_count = await count_measurements(db, station_id, from_, to)
    params = {"station_id": station_id, "from_": from_, "to": to}

    if total_count <= max_points:
        result = await db.execute(
            text(f"""
                SELECT recorded_at, {metric} AS value
                FROM acoustic_measurements
                WHERE station_id = :station_id
                  AND recorded_at >= :from_
                  AND recorded_at <= :to
                ORDER BY recorded_at ASC
            """),
            params,
        )
        return [dict(row) for row in result.mappings().all()], total_count, False, None

    seconds = bucket_seconds(from_, to, max_points)
    params["bucket_seconds"] = seconds
    interval = _bucket_interval()
    result = await db.execute(
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
                        CAST(:to AS timestamptz) - INTERVAL '1 microsecond',
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ),
                    {interval}
                ) AS bucket_start
            ), aggregated AS (
                SELECT
                    date_bin(
                        {interval},
                        recorded_at,
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ) AS bucket_start,
                    {metric} AS value
                FROM acoustic_measurements
                WHERE station_id = :station_id
                  AND recorded_at >= :from_
                  AND recorded_at <= :to
            )
            SELECT
                GREATEST(buckets.bucket_start, CAST(:from_ AS timestamptz)) AS recorded_at,
                LEAST(buckets.bucket_start + {interval}, CAST(:to AS timestamptz)) AS bucket_end,
                aggregated.value,
                aggregated.value_min,
                aggregated.value_max,
                aggregated.source_count
            FROM buckets
            LEFT JOIN (
                SELECT
                    bucket_start,
                    AVG(value) AS value,
                    MIN(value) AS value_min,
                    MAX(value) AS value_max,
                    COUNT(*) AS source_count
                FROM aggregated
                GROUP BY bucket_start
            ) aggregated ON aggregated.bucket_start = buckets.bucket_start
            ORDER BY buckets.bucket_start ASC
        """),
        params,
    )
    return [dict(row) for row in result.mappings().all()], total_count, True, seconds


async def fetch_adaptive_columns(
    db: AsyncSession,
    station_id,
    from_: datetime,
    to: datetime,
    columns: list[str],
    max_points: int,
) -> tuple[list[dict], int, bool, int | None]:
    """Versión multicolumna para las métricas binaurales y espectrales."""
    total_count = await count_measurements(db, station_id, from_, to)
    params = {"station_id": station_id, "from_": from_, "to": to}
    selected_columns = ",\n                    ".join(columns)

    if total_count <= max_points:
        result = await db.execute(
            text(f"""
                SELECT recorded_at, {selected_columns}
                FROM acoustic_measurements
                WHERE station_id = :station_id
                  AND recorded_at >= :from_
                  AND recorded_at <= :to
                ORDER BY recorded_at ASC
            """),
            params,
        )
        return [dict(row) for row in result.mappings().all()], total_count, False, None

    seconds = bucket_seconds(from_, to, max_points)
    params["bucket_seconds"] = seconds
    interval = _bucket_interval()
    aggregate_columns = ",\n                ".join(
        f"AVG({column}) AS {column},\n                MIN({column}) AS {column}_min,\n                MAX({column}) AS {column}_max"
        for column in columns
    )
    result = await db.execute(
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
                        CAST(:to AS timestamptz) - INTERVAL '1 microsecond',
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ),
                    {interval}
                ) AS bucket_start
            ), aggregated AS (
                SELECT
                    date_bin(
                        {interval},
                        recorded_at,
                        TIMESTAMPTZ '1970-01-01 00:00:00+00'
                    ) AS bucket_start,
                    {aggregate_columns},
                    COUNT(*) AS source_count
                FROM acoustic_measurements
                WHERE station_id = :station_id
                  AND recorded_at >= :from_
                  AND recorded_at <= :to
                GROUP BY 1
            )
            SELECT GREATEST(buckets.bucket_start, CAST(:from_ AS timestamptz)) AS recorded_at,
                   LEAST(buckets.bucket_start + {interval}, CAST(:to AS timestamptz)) AS bucket_end,
                   aggregated.*
            FROM buckets
            LEFT JOIN aggregated ON aggregated.bucket_start = buckets.bucket_start
            ORDER BY buckets.bucket_start ASC
        """),
        params,
    )
    return [dict(row) for row in result.mappings().all()], total_count, True, seconds

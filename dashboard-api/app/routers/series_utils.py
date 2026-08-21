from datetime import datetime, timedelta, timezone
from math import ceil
import re

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


DEFAULT_CHART_POINTS = 1500
MAX_CHART_POINTS = 3000
MIN_BUCKET_SECONDS = 60
MAX_PUBLIC_RANGE = timedelta(days=31)
MAX_FUTURE_SKEW = timedelta(minutes=5)
MAX_COMPARE_STATIONS = 25
MAX_COMPARE_TOTAL_POINTS = 12000
MAX_STATION_FILTER_LENGTH = MAX_COMPARE_STATIONS * 51
STATION_CODE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$")


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def resolve_range(from_: datetime | None, to: datetime | None) -> tuple[datetime, datetime]:
    """Normaliza y limita un intervalo público inclusivo ``[from, to]``."""
    now = datetime.now(timezone.utc)
    resolved_to = normalize_datetime(to) if to else now
    resolved_from = (
        normalize_datetime(from_)
        if from_
        else resolved_to - timedelta(hours=24)
    )

    if resolved_from > resolved_to:
        raise HTTPException(
            status_code=422,
            detail="El inicio del rango no puede ser posterior al final.",
        )
    if resolved_to > now + MAX_FUTURE_SKEW:
        raise HTTPException(
            status_code=422,
            detail="El final del rango no puede estar en el futuro.",
        )
    if resolved_to - resolved_from > MAX_PUBLIC_RANGE:
        raise HTTPException(
            status_code=422,
            detail="El rango público máximo es de 31 días.",
        )

    return resolved_from, resolved_to


def validate_station_code(station_code: str) -> str:
    if not STATION_CODE_PATTERN.fullmatch(station_code):
        raise HTTPException(status_code=422, detail="Código de estación no válido.")
    return station_code


def parse_station_codes(stations: str | None) -> list[str] | None:
    if stations is None:
        return None
    if len(stations) > MAX_STATION_FILTER_LENGTH:
        raise HTTPException(status_code=422, detail="Filtro de estaciones demasiado largo.")

    codes = list(dict.fromkeys(code.strip() for code in stations.split(",") if code.strip()))
    if not codes:
        raise HTTPException(status_code=422, detail="Indica al menos una estación válida.")
    if len(codes) > MAX_COMPARE_STATIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Se permiten como máximo {MAX_COMPARE_STATIONS} estaciones por consulta.",
        )
    for code in codes:
        validate_station_code(code)
    return codes


async def get_compare_stations(
    db: AsyncSession,
    station_codes: list[str] | None,
) -> list[dict]:
    station_filter = ""
    params: dict = {"limit": MAX_COMPARE_STATIONS + 1}
    if station_codes is not None:
        station_filter = "AND station_code = ANY(:codes)"
        params["codes"] = station_codes

    result = await db.execute(
        text(f"""
            SELECT id, station_code, locality
            FROM stations
            WHERE is_active = true
              {station_filter}
            ORDER BY station_code ASC
            LIMIT :limit
        """),
        params,
    )
    rows = [dict(row) for row in result.mappings().all()]
    if len(rows) > MAX_COMPARE_STATIONS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Hay más de {MAX_COMPARE_STATIONS} estaciones activas; "
                "selecciona explícitamente un subconjunto."
            ),
        )
    return rows


def compare_points_per_station(requested_points: int, station_count: int) -> int:
    if station_count <= 0:
        return requested_points
    return max(100, min(requested_points, MAX_COMPARE_TOTAL_POINTS // station_count))


async def get_station_id(db: AsyncSession, station_code: str):
    validate_station_code(station_code)
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
                        CAST(:to AS timestamptz),
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
                        CAST(:to AS timestamptz),
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

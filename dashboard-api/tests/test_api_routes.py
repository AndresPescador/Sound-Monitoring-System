import os
from datetime import datetime, timezone
from uuid import UUID

import httpx
import pytest

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_NAME", "noise_analytics")
os.environ.setdefault("DB_USERNAME", "dashboard_reader")
os.environ.setdefault("DB_PASSWORD", "test-only-password")

from app.database import get_db
from app.main import app


class Result:
    def __init__(self, rows=(), scalar=None, first=None):
        self._rows = list(rows)
        self._scalar = scalar
        self._first = first

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def fetchone(self):
        return self._first

    def scalar_one(self):
        return self._scalar


class FakeDatabase:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return next(self.results)


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


async def request(method, path, db):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.request(method, path)


@pytest.mark.asyncio
async def test_health_and_station_list_format_noise_level():
    station_id = UUID("11111111-1111-1111-1111-111111111111")
    db = FakeDatabase([
        Result(rows=[{
            "id": station_id,
            "station_code": "ST-CHAPINERO-01",
            "name": "Estación ST-CHAPINERO-01",
            "locality": "Chapinero",
            "address": None,
            "latitude": 4.65,
            "longitude": -74.06,
            "is_active": True,
            "last_seen_at": None,
            "current_leq_dbfs": -25.0,
        }])
    ])

    health = await request("GET", "/health", db)
    stations = await request("GET", "/stations", db)

    assert health.status_code == 200
    assert health.json()["service"] == "dashboard-api"
    assert stations.status_code == 200
    assert stations.json()[0]["noise_level"] == "moderate"
    assert stations.headers["cache-control"].startswith("public")


@pytest.mark.asyncio
async def test_station_summary_returns_404_before_running_summary_query():
    db = FakeDatabase([Result(first=None)])

    response = await request("GET", "/stations/ST-UNKNOWN-01/summary", db)

    assert response.status_code == 404
    assert "Estación no encontrada" in response.json()["detail"]
    assert len(db.calls) == 1


@pytest.mark.asyncio
async def test_measurements_validates_metric_and_serializes_response():
    station_id = UUID("22222222-2222-2222-2222-222222222222")
    recorded_at = datetime(2026, 8, 30, 15, tzinfo=timezone.utc)
    db = FakeDatabase([
        Result(first=(station_id,)),
        Result(scalar=1),
        Result(rows=[{"recorded_at": recorded_at, "value": -26.5}]),
    ])

    response = await request(
        "GET", "/stations/ST-CHAPINERO-01/measurements?metric=leq_dbfs", db
    )
    invalid = await request(
        "GET", "/stations/ST-CHAPINERO-01/measurements?metric=password", db
    )

    assert response.status_code == 200
    assert response.json()["metric"] == "leq_dbfs"
    assert response.json()["total_count"] == 1
    assert response.json()["is_aggregated"] is False
    assert invalid.status_code == 400


@pytest.mark.asyncio
async def test_hourly_and_daily_profile_apply_station_lookup_and_response_models():
    station_id = UUID("33333333-3333-3333-3333-333333333333")
    hour = datetime(2026, 8, 30, 15, tzinfo=timezone.utc)
    hourly_db = FakeDatabase([
        Result(first=(station_id,)),
        Result(rows=[{
            "hour_start": hour,
            "leq_hour": -25.0,
            "l10": -20.0,
            "l50": -25.0,
            "l90": -30.0,
            "dbfs_min": -30.0,
            "dbfs_max": -20.0,
            "dbfs_avg": -25.0,
            "measurement_count": 4,
            "avg_dominant_frequency": None,
            "avg_spectral_centroid": None,
            "avg_spectral_rolloff": None,
            "avg_zero_crossing_rate": None,
            "avg_ild_db": None,
            "avg_interaural_corr": None,
        }]),
    ])
    daily_db = FakeDatabase([
        Result(first=(station_id,)),
        Result(rows=[{
            "hour": 10,
            "hour_start": hour,
            "leq_hour": -25.0,
            "l10": -20.0,
            "l50": -25.0,
            "l90": -30.0,
            "measurement_count": 4,
        }]),
    ])

    hourly = await request("GET", "/stations/ST-TEST-01/hourly", hourly_db)
    daily = await request("GET", "/stations/ST-TEST-01/daily-profile?date=2026-08-30", daily_db)

    assert hourly.status_code == 200
    assert hourly.json()["data"][0]["measurement_count"] == 4
    assert daily.status_code == 200
    assert daily.json()["data"][0]["hour"] == 10


@pytest.mark.asyncio
async def test_compare_rejects_invalid_filter_and_returns_empty_for_no_active_stations():
    db = FakeDatabase([Result(rows=[])])

    empty = await request("GET", "/compare?stations=ST-ONE-01,ST-ONE-01", db)
    invalid = await request("GET", "/compare?stations=../../etc/passwd", db)

    assert empty.status_code == 200
    assert empty.json()["series"] == []
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_binaural_and_spectral_return_adaptive_metadata():
    station_id = UUID("44444444-4444-4444-4444-444444444444")
    recorded_at = datetime(2026, 8, 30, 15, tzinfo=timezone.utc)
    db = FakeDatabase([
        Result(first=(station_id,)),
        Result(scalar=1),
        Result(rows=[{
            "recorded_at": recorded_at,
            "ild_db": 2.0,
            "interaural_correlation": 0.8,
        }]),
        Result(first=(station_id,)),
        Result(scalar=1),
        Result(rows=[{
            "recorded_at": recorded_at,
            "dominant_frequency": 440.0,
            "spectral_centroid": 900.0,
            "spectral_rolloff": 1800.0,
            "zero_crossing_rate": 0.1,
        }]),
    ])

    binaural = await request("GET", "/stations/ST-TEST-01/binaural", db)
    spectral = await request("GET", "/stations/ST-TEST-01/spectral", db)

    assert binaural.status_code == 200
    assert binaural.json()["data"][0]["ild_db"] == 2.0
    assert spectral.status_code == 200
    assert spectral.json()["data"][0]["dominant_frequency"] == 440.0


@pytest.mark.asyncio
async def test_system_stats_exposes_global_and_per_station_totals():
    db = FakeDatabase([
        Result(rows=[{
            "station_code": "ST-TEST-01",
            "locality": "Chapinero",
            "is_active": True,
            "last_seen_at": None,
            "measurement_count": 8,
            "max_leq": -20.0,
            "avg_leq": -25.0,
            "total_stations": 1,
            "active_stations": 1,
            "total_measurements": 8,
            "total_hourly_aggregations": 2,
            "last_measurement_received_at": None,
        }])
    ])

    response = await request("GET", "/system/stats", db)

    assert response.status_code == 200
    assert response.json()["active_stations"] == 1
    assert response.json()["stations_summary"][0]["measurement_count"] == 8


@pytest.mark.asyncio
async def test_database_errors_are_sanitized_by_http_handler():
    from sqlalchemy.exc import SQLAlchemyError

    class BrokenDatabase:
        async def execute(self, *_args, **_kwargs):
            raise SQLAlchemyError("secret database detail")

    response = await request("GET", "/stations", BrokenDatabase())

    assert response.status_code == 503
    assert "secret database detail" not in response.text
    assert response.headers["retry-after"] == "2"

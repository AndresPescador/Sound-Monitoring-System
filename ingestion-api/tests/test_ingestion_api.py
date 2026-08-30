from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from app.dependencies import get_station_code
from app.main import app
from app.schemas.measurement import MeasurementPayload
from app.services.auth import AuthServiceError, TokenInvalidError, validate_token
from app.services.forward import ProcessingBackendError, forward_measurement


def valid_payload(**overrides):
    payload = {
        "stationCode": "ST-CHAPINERO-01",
        "timestamp": "2026-08-30T10:00:00",
        "filename": "Rec 2026-08-30 10h00m00s 1.wav",
        "duration": 60.0,
        "sampleRate": 44100,
        "isStereo": True,
        "dbfsLevel": -28.0,
        "rmsEnergy": 0.04,
        "leqDbfs": -26.5,
        "chLeftDbfs": -27.0,
        "chRightDbfs": -29.0,
        "chLeftRms": 0.04,
        "chRightRms": 0.03,
        "ildDb": 2.0,
        "interauralCorrelation": 0.85,
        "dominantFrequency": 440.0,
        "spectralCentroid": 900.0,
        "spectralRolloff": 1800.0,
        "zeroCrossingRate": 0.12,
    }
    payload.update(overrides)
    return payload


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_measurement_payload_accepts_camel_case_and_assumes_bogota_for_naive_time():
    model = MeasurementPayload.model_validate(valid_payload())

    assert model.station_code == "ST-CHAPINERO-01"
    assert model.sample_rate == 44100
    assert model.timestamp.utcoffset() == timedelta(hours=-5)


def test_measurement_payload_preserves_explicit_timezone_and_rejects_invalid_values():
    model = MeasurementPayload.model_validate(
        valid_payload(timestamp="2026-08-30T15:00:00+00:00")
    )
    assert model.timestamp.tzinfo == timezone.utc

    with pytest.raises(ValidationError):
        MeasurementPayload.model_validate(valid_payload(rmsEnergy=-0.1))
    with pytest.raises(ValidationError):
        MeasurementPayload.model_validate(valid_payload(interauralCorrelation=1.1))
    with pytest.raises(ValidationError):
        MeasurementPayload.model_validate(valid_payload(sampleRate=0))


@pytest.mark.asyncio
async def test_auth_service_maps_success_and_invalid_responses():
    request = httpx.Request("POST", "http://auth.test/validate")

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, _url, json):
            assert json == {"token": "signed-token"}
            return httpx.Response(200, json={"stationCode": "ST-TEST-01"}, request=request)

    with patch("app.services.auth.httpx.AsyncClient", return_value=FakeClient()):
        assert await validate_token("signed-token") == "ST-TEST-01"

    class UnauthorizedClient(FakeClient):
        async def post(self, _url, json):
            return httpx.Response(401, text="invalid", request=request)

    with patch("app.services.auth.httpx.AsyncClient", return_value=UnauthorizedClient()):
        with pytest.raises(TokenInvalidError):
            await validate_token("signed-token")


@pytest.mark.asyncio
async def test_auth_service_maps_dependency_failures_to_service_error():
    request = httpx.Request("POST", "http://auth.test/validate")

    class UnavailableClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            raise httpx.ConnectError("offline", request=request)

    with patch("app.services.auth.httpx.AsyncClient", return_value=UnavailableClient()):
        with pytest.raises(AuthServiceError):
            await validate_token("signed-token")


@pytest.mark.asyncio
async def test_forward_measurement_overwrites_payload_station_code_and_accepts_duplicate():
    payload = MeasurementPayload.model_validate(valid_payload(stationCode="ST-WRONG-99"))
    request = httpx.Request("POST", "http://processing.test/measurements")
    observed = {}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, _url, json):
            observed.update(json)
            return httpx.Response(200, json={"result": "duplicate"}, request=request)

    with patch("app.services.forward.httpx.AsyncClient", return_value=FakeClient()):
        assert await forward_measurement("ST-AUTH-01", payload) == 200

    assert observed["stationCode"] == "ST-AUTH-01"


@pytest.mark.asyncio
async def test_forward_measurement_maps_connectivity_failure():
    payload = MeasurementPayload.model_validate(valid_payload())
    request = httpx.Request("POST", "http://processing.test/measurements")

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            raise httpx.TimeoutException("timeout", request=request)

    with patch("app.services.forward.httpx.AsyncClient", return_value=FakeClient()):
        with pytest.raises(ProcessingBackendError):
            await forward_measurement("ST-AUTH-01", payload)


@pytest.mark.asyncio
async def test_dependency_translates_invalid_token_to_401():
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")

    with patch("app.dependencies.validate_token", new=AsyncMock(side_effect=TokenInvalidError("bad"))):
        with pytest.raises(HTTPException) as error:
            await get_station_code(credentials)

    assert error.value.status_code == 401
    assert error.value.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_ingest_route_returns_created_and_forwards_authenticated_identity():
    async def station_override():
        return "ST-CHAPINERO-01"

    app.dependency_overrides[get_station_code] = station_override
    forward = AsyncMock(return_value=201)

    with patch("app.routers.ingest.forward_measurement", new=forward):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/ingest", json=valid_payload())

    assert response.status_code == 201
    assert response.json()["station_code"] == "ST-CHAPINERO-01"
    assert forward.await_args.kwargs["station_code"] == "ST-CHAPINERO-01"


@pytest.mark.asyncio
async def test_ingest_route_rejects_station_spoofing_and_maps_backend_failure():
    async def station_override():
        return "ST-CHAPINERO-01"

    app.dependency_overrides[get_station_code] = station_override
    forward = AsyncMock(side_effect=ProcessingBackendError("offline"))

    with patch("app.routers.ingest.forward_measurement", new=forward):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            forbidden = await client.post(
                "/ingest", json=valid_payload(stationCode="ST-USAQUEN-01")
            )
            unavailable = await client.post("/ingest", json=valid_payload())

    assert forbidden.status_code == 403
    assert unavailable.status_code == 503
    assert forward.await_count == 1


@pytest.mark.asyncio
async def test_ingest_route_returns_ok_for_duplicate_and_422_for_invalid_payload():
    async def station_override():
        return "ST-CHAPINERO-01"

    app.dependency_overrides[get_station_code] = station_override

    with patch("app.routers.ingest.forward_measurement", new=AsyncMock(return_value=200)):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            duplicate = await client.post("/ingest", json=valid_payload())
            invalid = await client.post("/ingest", json={"stationCode": "ST-TEST"})

    assert duplicate.status_code == 200
    assert duplicate.json()["message"] == "Fragmento duplicado, ignorado."
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_ingestion_health_is_public():
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ingestion-api"}

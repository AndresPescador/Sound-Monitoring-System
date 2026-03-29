import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_station_code
from app.schemas.measurement import IngestResponse, MeasurementPayload
from app.services.forward import ProcessingBackendError, forward_measurement

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/ingest",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Recibir métricas acústicas de una estación",
    description=(
        "Endpoint principal de la Ingestion API. "
        "Recibe el JSON de métricas generado por process_audio.py, "
        "valida su formato, autentica la estación mediante el token Bearer "
        "y reenvía los datos al Noise Processing Backend a través del Load Balancer."
    ),
)
async def ingest_measurement(
    payload: MeasurementPayload,
    station_code: str = Depends(get_station_code),
) -> IngestResponse:
    """
    Flujo del endpoint:
      1. Pydantic valida automáticamente el JSON del body (HTTP 422 si falla).
      2. get_station_code valida el token con el Auth Service (HTTP 401/503 si falla).
      3. Se reenvían los datos al Processing Backend con el station_code adjunto.
      4. Se devuelve confirmación al cliente (la estación).
    """
    try:
        await forward_measurement(station_code=station_code, payload=payload)

    except ProcessingBackendError as e:
        logger.error(
            f"Error al reenviar métricas al Processing Backend — "
            f"estación: {station_code}, error: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Error al procesar los datos. Intente más tarde.",
        )

    logger.info(
        f"Ingesta exitosa — estación: {station_code}, "
        f"recorded_at: {payload.timestamp.isoformat()}"
    )

    return IngestResponse(
        status="ok",
        message="Métricas recibidas correctamente.",
        station_code=station_code,
        recorded_at=payload.timestamp,
    )


@router.get(
    "/health",
    summary="Health check",
    description="Endpoint de salud para el Load Balancer y sistemas de monitoreo.",
)
async def health_check() -> dict:
    return {"status": "ok", "service": "ingestion-api"}

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.dependencies import get_station_code
from app.schemas.measurement import IngestResponse, MeasurementPayload
from app.services.forward import ProcessingBackendError, forward_measurement

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ingest", summary="Recibir métricas acústicas de una estación")
async def ingest_measurement(
    response: Response,
    payload: MeasurementPayload,
    station_code: str = Depends(get_station_code),
) -> IngestResponse:
    try:
        processing_status = await forward_measurement(
            station_code=station_code,
            payload=payload
        )
    except ProcessingBackendError as e:
        logger.error(f"Error al reenviar métricas — estación: {station_code}, error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Error al procesar los datos. Intente más tarde.",
        )

    logger.info(f"Ingesta exitosa — estación: {station_code}, recorded_at: {payload.timestamp.isoformat()}")

    # Propagar el código HTTP exacto del Processing Backend
    if processing_status == 201:
        response.status_code = status.HTTP_201_CREATED
        message = "Métricas recibidas correctamente."
    else:
        response.status_code = status.HTTP_200_OK
        message = "Fragmento duplicado, ignorado."

    return IngestResponse(
        status="ok",
        message=message,
        station_code=station_code,
        recorded_at=payload.timestamp,
    )


@router.get("/health", summary="Health check")
async def health_check() -> dict:
    return {"status": "ok", "service": "ingestion-api"}
    
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
    """
    Recibe métricas acústicas de una estación autenticada.

    Validación de identidad:
    El stationCode del payload debe coincidir con el stationCode
    del token JWT. Si no coinciden, se rechaza con HTTP 403.
    Esto evita que un token válido de una estación pueda enviar
    datos bajo la identidad de otra.
    """

    if payload.station_code and payload.station_code != station_code:
        logger.warning(
            f"Intento de envío con identidad incorrecta — "
            f"token: {station_code}, payload stationCode: {payload.station_code}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"El token pertenece a '{station_code}' pero el payload "
                f"declara '{payload.station_code}'. "
                f"Usa el token correcto para esta estación."
            ),
        )

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

    logger.info(
        f"Ingesta exitosa — estación: {station_code}, "
        f"recorded_at: {payload.timestamp.isoformat()}"
    )

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
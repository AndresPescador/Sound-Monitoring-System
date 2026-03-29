import logging

import httpx

from app.config import settings
from app.schemas.measurement import MeasurementPayload

logger = logging.getLogger(__name__)


class ProcessingBackendError(Exception):
    """El Processing Backend devolvió un error o no está disponible."""


async def forward_measurement(
    station_code: str,
    payload: MeasurementPayload,
) -> dict:
    """
    Reenvía las métricas acústicas validadas al Noise Processing Backend
    a través del Load Balancer.

    Adjunta el station_code (obtenido del Auth Service) al payload para
    que el Processing Backend pueda identificar la estación sin necesidad
    de re-validar el token.

    Args:
        station_code: Identificador de la estación validado por el Auth Service.
        payload:      Métricas acústicas validadas por Pydantic.

    Returns:
        Respuesta JSON del Processing Backend.

    Raises:
        ProcessingBackendError: Si el backend no está disponible o devuelve error.
    """
    url = settings.processing_backend_url

    # Construir el cuerpo de la petición incluyendo el station_code
    body = payload.model_dump(mode="json")
    body["station_code"] = station_code

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=body)

        if response.status_code in (200, 201):
            logger.info(
                f"Métricas enviadas al Processing Backend — "
                f"estación: {station_code}, "
                f"recorded_at: {payload.timestamp.isoformat()}"
            )
            return response.json()

        logger.error(
            f"Processing Backend respondió con error: "
            f"{response.status_code} — {response.text}"
        )
        raise ProcessingBackendError(
            f"Processing Backend respondió con código {response.status_code}."
        )

    except httpx.ConnectError as e:
        logger.error(f"No se pudo conectar al Processing Backend en {url}: {e}")
        raise ProcessingBackendError("Processing Backend no disponible.")

    except httpx.TimeoutException as e:
        logger.error(f"Timeout al contactar Processing Backend en {url}: {e}")
        raise ProcessingBackendError("Processing Backend no respondió a tiempo.")

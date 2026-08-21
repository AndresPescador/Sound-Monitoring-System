import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class AuthServiceError(Exception):
    """El Auth Service devolvió un error inesperado o no está disponible."""


class TokenInvalidError(Exception):
    """El token es inválido, expirado o fue revocado."""


async def validate_token(token: str) -> str:
    """
    Valida el token JWT contra el Station Authentication Service.

    Envía el token directamente al Auth Service por la red interna de servicios.
    Si el token es válido, devuelve el station_code asociado a esa estación.

    Args:
        token: Bearer token extraído del header Authorization.

    Returns:
        station_code: Identificador de la estación (ej: "ST-CHAPINERO-01").

    Raises:
        TokenInvalidError: Si el token es inválido, expirado o revocado (HTTP 401).
        AuthServiceError: Si el Auth Service no está disponible o devuelve un error
                          inesperado (HTTP 5xx o error de conexión).
    """
    url = settings.auth_service_url

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                url,
                json={"token": token},
            )

        if response.status_code == 200:
            data = response.json()
            station_code: str = data["stationCode"]
            logger.debug(f"Token válido para estación: {station_code}")
            return station_code

        if response.status_code == 401:
            logger.warning(f"Token rechazado por Auth Service: {response.text}")
            raise TokenInvalidError("Token inválido, expirado o revocado.")

        # Cualquier otro código (5xx, etc.) se trata como error del servicio
        logger.error(
            f"Auth Service respondió con código inesperado: "
            f"{response.status_code} — {response.text}"
        )
        raise AuthServiceError(
            f"Auth Service respondió con código {response.status_code}."
        )

    except httpx.ConnectError as e:
        logger.error(f"No se pudo conectar al Auth Service en {url}: {e}")
        raise AuthServiceError("Auth Service no disponible.")

    except httpx.TimeoutException as e:
        logger.error(f"Timeout al contactar Auth Service en {url}: {e}")
        raise AuthServiceError("Auth Service no respondió a tiempo.")

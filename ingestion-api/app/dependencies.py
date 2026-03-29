import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.auth import AuthServiceError, TokenInvalidError, validate_token

logger = logging.getLogger(__name__)

# Extrae el token del header: Authorization: Bearer <token>
bearer_scheme = HTTPBearer()


async def get_station_code(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """
    Dependencia de FastAPI que valida el Bearer token del request.

    Extrae el token del header Authorization, lo envía al Auth Service
    y devuelve el station_code asociado si es válido.

    Raises:
        HTTP 401: Si el token es inválido, expirado o revocado.
        HTTP 503: Si el Auth Service no está disponible.
    """
    token = credentials.credentials

    try:
        station_code = await validate_token(token)
        return station_code

    except TokenInvalidError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    except AuthServiceError as e:
        logger.error(f"Auth Service no disponible: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de autenticación no disponible. Intente más tarde.",
        )

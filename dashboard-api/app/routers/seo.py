from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.seo import SeoStationCatalog

router = APIRouter(prefix="/seo", tags=["seo"])

# El catálogo se usa para el sitemap. Mantenerlo acotado evita convertir el
# endpoint público en una enumeración no limitada de la base analítica.
MAX_SEO_STATIONS = 500


@router.get("/stations", response_model=SeoStationCatalog)
async def list_seo_stations(
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Lista estaciones activas con el mínimo dato necesario para SEO.

    No expone IDs, dirección, coordenadas, estado de conexión ni métricas. Los
    datos retornados ya son públicos, pero este contrato reducido evita que el
    proceso de prerenderizado amplíe la superficie de información publicada.
    """
    sql = text("""
        SELECT station_code, name, locality
        FROM stations
        WHERE is_active = true
        ORDER BY locality, station_code
        LIMIT :limit
    """)
    result = await db.execute(sql, {"limit": MAX_SEO_STATIONS})

    # El snapshot de una release debe reflejar el estado actual, sin recibir
    # una respuesta stale de una capa intermedia.
    response.headers["Cache-Control"] = "no-store"
    return SeoStationCatalog(stations=[dict(row) for row in result.mappings().all()])

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings

from app.routers import stations, measurements, aggregations, compare, binaural, spectral, system

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Dashboard Backend API",
    description=(
        "API de consulta de datos acústicos para el dashboard de visualización. "
        "Expone métricas de acoustic_measurements y hourly_aggregations "
        "optimizadas para gráficas Recharts y mapa Leaflet."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_allowed_origin],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_request, exc):
    logger.warning("Consulta pública PostgreSQL rechazada: %s", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={"detail": "Consulta temporalmente no disponible."},
        headers={"Retry-After": "2", "Cache-Control": "no-store"},
    )


@app.middleware("http")
async def public_cache_headers(request, call_next):
    response = await call_next(request)
    if (
        request.method == "GET"
        and request.url.path != "/health"
        and response.status_code == 200
    ):
        response.headers["Cache-Control"] = (
            f"public, max-age={settings.public_cache_seconds}, "
            f"stale-while-revalidate={settings.public_cache_seconds}"
        )
    return response

app.include_router(stations.router)
app.include_router(measurements.router)
app.include_router(aggregations.router)
app.include_router(compare.router)
app.include_router(binaural.router)
app.include_router(spectral.router)
app.include_router(system.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "dashboard-api"}

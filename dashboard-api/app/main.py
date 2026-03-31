import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import stations, measurements, aggregations, compare, binaural, spectral, system

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
)

app = FastAPI(
    title="Dashboard Backend API",
    description=(
        "API de consulta de datos acústicos para el dashboard de visualización. "
        "Expone métricas de acoustic_measurements y hourly_aggregations "
        "optimizadas para gráficas Recharts y mapa Leaflet."
    ),
    version="1.0.0",
)

# CORS: permite que el frontend React (en cualquier puerto durante desarrollo)
# pueda llamar a esta API. En producción reemplazar "*" con la URL del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

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

import logging

from fastapi import FastAPI

from app.routers.ingest import router

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
)

# ── Aplicación ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Ingestion API",
    description=(
        "Capa de ingesta del Sistema de Monitoreo Acústico Binaural. "
        "Recibe las métricas acústicas generadas por las estaciones de monitoreo, "
        "valida su formato y autenticidad, y las reenvía al Noise Processing Backend."
    ),
    version="1.0.0",
)

app.include_router(router)

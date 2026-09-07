from pydantic import BaseModel


class SeoStation(BaseModel):
    """Datos mínimos de una estación aptos para indexación pública."""

    station_code: str
    name: str
    locality: str


class SeoStationCatalog(BaseModel):
    """Catálogo acotado usado únicamente para generar páginas SEO estáticas."""

    stations: list[SeoStation]

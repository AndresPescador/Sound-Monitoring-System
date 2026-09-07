import asyncio
import unittest

from fastapi import Response

from app.main import app
from app.routers.seo import MAX_SEO_STATIONS, list_seo_stations
from app.schemas.seo import SeoStation, SeoStationCatalog


class _Mappings:
    def all(self):
        return [{"station_code": "ST-CHAPINERO-01", "name": "Estación Chapinero", "locality": "Chapinero"}]


class _Result:
    def mappings(self):
        return _Mappings()


class _Database:
    def __init__(self):
        self.params = None

    async def execute(self, _query, params):
        self.params = params
        return _Result()


class SeoCatalogSchemaTest(unittest.TestCase):
    def test_catalog_contract_contains_only_indexing_fields(self):
        catalog = SeoStationCatalog(
            stations=[
                SeoStation(
                    station_code="ST-CHAPINERO-01",
                    name="Estación Chapinero",
                    locality="Chapinero",
                )
            ]
        )

        self.assertEqual(
            {
                "stations": [
                    {
                        "station_code": "ST-CHAPINERO-01",
                        "name": "Estación Chapinero",
                        "locality": "Chapinero",
                    }
                ]
            },
            catalog.model_dump(),
        )
        self.assertNotIn("latitude", catalog.model_dump_json())
        self.assertNotIn("address", catalog.model_dump_json())
        self.assertNotIn("secret", catalog.model_dump_json())

    def test_catalog_route_is_read_only_and_has_the_reduced_schema(self):
        operations = app.openapi()["paths"]["/seo/stations"]

        self.assertEqual({"get"}, set(operations))
        schema = operations["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        self.assertEqual("#/components/schemas/SeoStationCatalog", schema["$ref"])

    def test_catalog_response_is_uncached_and_bounded(self):
        response = Response()
        database = _Database()

        catalog = asyncio.run(list_seo_stations(response, database))

        self.assertEqual("no-store", response.headers["Cache-Control"])
        self.assertEqual({"limit": MAX_SEO_STATIONS}, database.params)
        self.assertEqual("ST-CHAPINERO-01", catalog.stations[0].station_code)


if __name__ == "__main__":
    unittest.main()

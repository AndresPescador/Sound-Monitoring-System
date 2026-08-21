import asyncio
import os
import unittest

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_NAME", "noise_analytics")
os.environ.setdefault("DB_USERNAME", "dashboard_reader")
os.environ.setdefault("DB_PASSWORD", "test-only-password")

from app.config import Settings
from app.main import database_error_handler


class SecurityConfigurationTest(unittest.TestCase):

    def test_builds_database_url_without_string_interpolation(self):
        settings = Settings(
            _env_file=None,
            db_host="postgres-noise",
            db_name="noise_analytics",
            db_username="dashboard_reader",
            db_password="password@with:/reserved?characters",
        )

        url = settings.database_url()

        self.assertEqual("dashboard_reader", url.username)
        self.assertEqual("password@with:/reserved?characters", url.password)

    def test_rejects_unbounded_pool_configuration(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, db_pool_size=0)

    def test_database_errors_return_sanitized_503(self):
        response = asyncio.run(
            database_error_handler(None, SQLAlchemyError("internal database detail"))
        )

        self.assertEqual(503, response.status_code)
        self.assertEqual("2", response.headers["retry-after"])
        self.assertNotIn(b"internal database detail", response.body)


if __name__ == "__main__":
    unittest.main()

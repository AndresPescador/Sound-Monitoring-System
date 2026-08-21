from pydantic import Field
from pydantic_settings import BaseSettings
from sqlalchemy import URL


class Settings(BaseSettings):
    db_url: str | None = None
    db_host: str | None = None
    db_port: int = 5432
    db_name: str | None = None
    db_username: str | None = None
    db_password: str | None = None
    db_pool_size: int = Field(default=5, ge=1, le=20)
    db_max_overflow: int = Field(default=5, ge=0, le=20)
    db_pool_timeout_seconds: int = Field(default=3, ge=1, le=30)
    db_statement_timeout_ms: int = Field(default=5000, ge=1000, le=30000)
    cors_allowed_origin: str = "http://localhost:3000"
    public_cache_seconds: int = Field(default=30, ge=0, le=300)
    port: int = 8083

    def database_url(self) -> str | URL:
        if self.db_url:
            return self.db_url
        required = {
            "DB_HOST": self.db_host,
            "DB_NAME": self.db_name,
            "DB_USERNAME": self.db_username,
            "DB_PASSWORD": self.db_password,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(
                "Faltan variables de conexión PostgreSQL: " + ", ".join(missing)
            )
        return URL.create(
            "postgresql+asyncpg",
            username=self.db_username,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    class Config:
        env_file = ".env"


settings = Settings()

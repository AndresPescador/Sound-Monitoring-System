from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_url: str
    port: int = 8083

    class Config:
        env_file = ".env"


settings = Settings()

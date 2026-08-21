from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Dependencias internas. En Docker se resuelven exclusivamente por la red
    # service_internal y nunca a través del gateway publicado.
    auth_service_url: str = "http://auth-service:8081/auth/validate"
    processing_backend_url: str = (
        "http://noise-processing:8082/processing/measurements"
    )
    port: int = 8000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

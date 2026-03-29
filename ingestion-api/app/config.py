from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    load_balancer_url: str
    auth_service_path: str = "/auth/validate"
    processing_backend_path: str = "/processing/measurements"
    port: int = 8000

    @property
    def auth_service_url(self) -> str:
        return f"{self.load_balancer_url}{self.auth_service_path}"

    @property
    def processing_backend_url(self) -> str:
        return f"{self.load_balancer_url}{self.processing_backend_path}"

    class Config:
        env_file = ".env"


settings = Settings()

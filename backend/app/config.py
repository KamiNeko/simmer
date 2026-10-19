from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SIMMER_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    secret_key: str = "change-me"
    admin_username: str | None = None
    admin_password: str | None = None
    base_url: str = "http://localhost:8080"
    static_dir: Path | None = None
    cookie_secure: bool = False
    session_days: int = 30

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'simmer.db'}"


@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SIMMER_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    # Encrypts the AI provider API keys. Generated into the data directory when unset.
    secret_key: str | None = None
    admin_username: str | None = None
    admin_password: str | None = None
    base_url: str = "http://localhost:8080"
    static_dir: Path | None = None
    # Unset means: secure cookies whenever base_url is https.
    cookie_secure: bool | None = None
    session_days: int = 30
    # The git commit the Docker image was built from, set by the image build.
    commit: str | None = None

    @property
    def secure_cookies(self) -> bool:
        """Whether the login cookie is sent over HTTPS only."""
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.base_url.startswith("https://")

    @property
    def database_url(self) -> str:
        """The SQLite URL for simmer.db in the data directory."""
        return f"sqlite:///{self.data_dir / 'simmer.db'}"


@lru_cache
def get_settings() -> Settings:
    """The settings, read once from the environment and .env."""
    return Settings()

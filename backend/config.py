from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mail_mode: Literal["dry-run", "sandbox", "live"] = "dry-run"
    sandbox_redirect_to: str | None = None

    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_tls: bool = True
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str = "noreply@example.invalid"

    max_upload_mb: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()

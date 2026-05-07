from __future__ import annotations

from functools import lru_cache
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mail_mode: Literal["dry-run", "sandbox", "live"] = "dry-run"
    sandbox_redirect_to: Optional[str] = None

    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_tls: bool = True
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    mail_from: str = "noreply@example.invalid"
    archive_bcc_to: Optional[str] = None

    max_upload_mb: int = 2
    runtime_settings_file: str = "data/server_settings.json"

    app_env: Literal["development", "production"] = "development"
    basic_auth_enabled: bool = True
    basic_auth_username: Optional[str] = None
    basic_auth_password: Optional[str] = None


@lru_cache
def get_settings() -> Settings:
    return Settings()

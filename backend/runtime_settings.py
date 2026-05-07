from __future__ import annotations

import json
from pathlib import Path
from threading import RLock
from typing import Optional

from pydantic import BaseModel

from backend.config import Settings


class RuntimeMailSettings(BaseModel):
    mail_mode: str
    sandbox_redirect_to: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_tls: bool
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    mail_from: str
    archive_bcc_to: Optional[str] = None


class RuntimeMailSettingsUpdate(BaseModel):
    mail_mode: str
    sandbox_redirect_to: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_tls: bool
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    clear_smtp_password: bool = False
    mail_from: str
    archive_bcc_to: Optional[str] = None


class RuntimeMailSettingsPublic(BaseModel):
    mail_mode: str
    sandbox_redirect_to: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_tls: bool
    smtp_user: Optional[str] = None
    smtp_password_set: bool
    mail_from: str
    archive_bcc_to: Optional[str] = None


class RuntimeSettingsStore:
    def __init__(self, path: Path):
        self._path = path
        # RLock kell, mert update() a lock alatt meghívja a get()-et is.
        self._lock = RLock()
        self._cached: Optional[RuntimeMailSettings] = None

    def _defaults(self, settings: Settings) -> RuntimeMailSettings:
        return RuntimeMailSettings(
            mail_mode=settings.mail_mode,
            sandbox_redirect_to=settings.sandbox_redirect_to,
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            smtp_tls=settings.smtp_tls,
            smtp_user=settings.smtp_user,
            smtp_password=settings.smtp_password,
            mail_from=settings.mail_from,
            archive_bcc_to=settings.archive_bcc_to,
        )

    def get(self, settings: Settings) -> RuntimeMailSettings:
        with self._lock:
            if self._cached is not None:
                return self._cached
            defaults = self._defaults(settings)
            if not self._path.exists():
                self._cached = defaults
                return self._cached
            data = json.loads(self._path.read_text(encoding="utf-8"))
            # Fájlból olvasott értékek felülírják az env defaultokat.
            self._cached = RuntimeMailSettings(**{**defaults.model_dump(), **data})
            return self._cached

    def update(self, settings: Settings, payload: RuntimeMailSettingsUpdate) -> RuntimeMailSettings:
        with self._lock:
            current = self.get(settings)
            # Ha nem adnak meg új jelszót, a meglévőt megtartjuk.
            new_password = current.smtp_password
            if payload.clear_smtp_password:
                new_password = None
            elif payload.smtp_password:
                new_password = payload.smtp_password
            updated = RuntimeMailSettings(
                mail_mode=payload.mail_mode,
                sandbox_redirect_to=payload.sandbox_redirect_to,
                smtp_host=payload.smtp_host,
                smtp_port=payload.smtp_port,
                smtp_tls=payload.smtp_tls,
                smtp_user=payload.smtp_user,
                smtp_password=new_password,
                mail_from=payload.mail_from,
                archive_bcc_to=payload.archive_bcc_to,
            )
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(updated.model_dump(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self._cached = updated
            return updated


def to_public(settings: RuntimeMailSettings) -> RuntimeMailSettingsPublic:
    return RuntimeMailSettingsPublic(
        mail_mode=settings.mail_mode,
        sandbox_redirect_to=settings.sandbox_redirect_to,
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_tls=settings.smtp_tls,
        smtp_user=settings.smtp_user,
        smtp_password_set=bool(settings.smtp_password),
        mail_from=settings.mail_from,
        archive_bcc_to=settings.archive_bcc_to,
    )

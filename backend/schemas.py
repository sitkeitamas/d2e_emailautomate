from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ParseCsvResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, str]]
    row_count: int


class ParsePasteRequest(BaseModel):
    text: str


class PreviewItem(BaseModel):
    to_email: str
    to_name: Optional[str] = None
    subject: str
    body: str
    missing_placeholders: list[str] = Field(default_factory=list)
    missing_code: bool = False


class PreviewRequest(BaseModel):
    template: str
    subject_template: str = "Értesítés"
    rows: list[dict[str, str]]
    email_column: str
    name_column: Optional[str] = None
    code_column: str
    limit: int = 50


class PreviewResponse(BaseModel):
    items: list[PreviewItem]


class SendRequest(BaseModel):
    template: str
    subject_template: str = "Értesítés"
    rows: list[dict[str, str]]
    email_column: str
    name_column: Optional[str] = None
    code_column: str


class SendResultItem(BaseModel):
    to_email: str
    ok: bool
    detail: str


class SendResponse(BaseModel):
    mode: str
    results: list[SendResultItem]


class HealthResponse(BaseModel):
    ok: bool
    mail_mode: str


class ServerSettingsResponse(BaseModel):
    mail_mode: str
    sandbox_redirect_to: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_tls: bool
    smtp_user: Optional[str] = None
    smtp_password_set: bool
    mail_from: str
    archive_bcc_to: Optional[str] = None


class ServerSettingsUpdateRequest(BaseModel):
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

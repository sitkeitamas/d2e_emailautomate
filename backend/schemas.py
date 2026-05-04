from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ParseCsvResponse(BaseModel):
    columns: list[str]
    rows: list[dict[str, str]]
    row_count: int


class PreviewItem(BaseModel):
    to_email: str
    to_name: Optional[str] = None
    subject: str
    body: str
    missing_placeholders: list[str] = Field(default_factory=list)


class PreviewRequest(BaseModel):
    template: str
    subject_template: str = "Értesítés"
    rows: list[dict[str, str]]
    email_column: str
    name_column: Optional[str] = None
    limit: int = 50


class PreviewResponse(BaseModel):
    items: list[PreviewItem]


class SendRequest(BaseModel):
    template: str
    subject_template: str = "Értesítés"
    rows: list[dict[str, str]]
    email_column: str
    name_column: Optional[str] = None


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

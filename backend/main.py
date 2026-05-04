from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import Settings, get_settings
from backend.csv_tools import parse_csv_bytes
from backend.mail_send import send_mail
from backend.render import normalize_email, render_row
from backend.schemas import (
    HealthResponse,
    ParseCsvResponse,
    PreviewItem,
    PreviewRequest,
    PreviewResponse,
    SendRequest,
    SendResponse,
    SendResultItem,
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="D2E mail automation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _settings() -> Settings:
    return get_settings()


@app.get("/api/health", response_model=HealthResponse)
def health(settings: Settings = Depends(_settings)) -> HealthResponse:
    return HealthResponse(ok=True, mail_mode=settings.mail_mode)


@app.get("/api/config")
def public_config(settings: Settings = Depends(_settings)) -> dict[str, str]:
    return {
        "mail_mode": settings.mail_mode,
        "smtp_host": settings.smtp_host,
        "smtp_port": str(settings.smtp_port),
    }


@app.post("/api/parse-csv", response_model=ParseCsvResponse)
async def parse_csv(
    file: UploadFile = File(...),
    settings: Settings = Depends(_settings),
) -> ParseCsvResponse:
    raw = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(raw) > max_bytes:
        raise HTTPException(413, f"A fájl túl nagy (max {settings.max_upload_mb} MB).")

    try:
        columns, rows = parse_csv_bytes(raw)
    except (UnicodeDecodeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e

    if not rows:
        raise HTTPException(400, "Üres táblázat.")

    max_rows = 2000
    if len(rows) > max_rows:
        raise HTTPException(400, f"Túl sok sor (max {max_rows}).")

    return ParseCsvResponse(columns=columns, rows=rows, row_count=len(rows))


@app.post("/api/preview", response_model=PreviewResponse)
def preview(req: PreviewRequest) -> PreviewResponse:
    if not req.rows:
        raise HTTPException(400, "Nincs sor az előnézethez.")

    limit = max(1, min(req.limit, 200))
    items: list[PreviewItem] = []
    for row in req.rows[:limit]:
        if req.email_column not in row:
            raise HTTPException(400, f"Nincs ilyen e-mail oszlop: {req.email_column!r}")

        raw_email = row[req.email_column]
        try:
            email = normalize_email(raw_email)
        except ValueError as e:
            raise HTTPException(400, f"Érvénytelen e-mail: {raw_email!r} ({e})") from e

        name: str | None = None
        if req.name_column and req.name_column in row:
            name = row[req.name_column] or None

        subject, body, missing = render_row(req.template, req.subject_template, row)
        items.append(
            PreviewItem(
                to_email=email,
                to_name=name,
                subject=subject,
                body=body,
                missing_placeholders=missing,
            )
        )
    return PreviewResponse(items=items)


@app.post("/api/send", response_model=SendResponse)
async def send(req: SendRequest, settings: Settings = Depends(_settings)) -> SendResponse:
    if not req.rows:
        raise HTTPException(400, "Nincs sor a küldéshez.")

    results: list[SendResultItem] = []

    for row in req.rows:
        if req.email_column not in row:
            raise HTTPException(400, f"Nincs ilyen e-mail oszlop: {req.email_column!r}")

        raw_email = row[req.email_column]
        try:
            target = normalize_email(raw_email)
        except ValueError as e:
            results.append(SendResultItem(to_email=raw_email, ok=False, detail=str(e)))
            continue

        subject, body, missing = render_row(req.template, req.subject_template, row)
        if missing:
            results.append(
                SendResultItem(
                    to_email=target,
                    ok=False,
                    detail=f"Hiányzó helyőrzők: {', '.join(missing)}",
                )
            )
            continue

        body_out = body
        if settings.mail_mode == "sandbox":
            body_out = (
                body
                + "\n\n---\n"
                + f"Sandbox: eredeti címzett: {target}\n"
                + f"Tárgy (renderelt): {subject}\n"
            )

        try:
            await send_mail(
                settings,
                to_addrs=[target],
                subject=subject,
                body_text=body_out,
            )
        except Exception as e:  # noqa: BLE001 – felületre visszük
            results.append(SendResultItem(to_email=target, ok=False, detail=str(e)))
            continue

        detail_ok = (
            "dry-run: SMTP nem hívódott"
            if settings.mail_mode == "dry-run"
            else settings.mail_mode
        )
        results.append(SendResultItem(to_email=target, ok=True, detail=detail_ok))

    return SendResponse(mode=settings.mail_mode, results=results)


if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="spa")

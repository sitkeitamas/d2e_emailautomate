from __future__ import annotations

from email.message import EmailMessage
from typing import Any

import aiosmtplib

async def send_mail(
    settings: Any,
    *,
    to_addrs: list[str],
    subject: str,
    body_text: str,
) -> str:
    if settings.mail_mode == "dry-run":
        return "dry-run: nem küldtünk SMTP-n."

    recipients = list(to_addrs)
    if settings.mail_mode == "sandbox":
        if not settings.sandbox_redirect_to:
            raise RuntimeError("sandbox módhoz állítsd be a SANDBOX_REDIRECT_TO környezeti változót.")
        recipients = [settings.sandbox_redirect_to]

    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body_text)

    # 465 = implicit TLS (SMTPS), 587/25 = plain + optional STARTTLS.
    smtp_port = int(settings.smtp_port)
    use_implicit_tls = bool(settings.smtp_tls and smtp_port == 465)
    use_starttls = bool(settings.smtp_tls and not use_implicit_tls)
    async with aiosmtplib.SMTP(
        hostname=settings.smtp_host,
        port=smtp_port,
        use_tls=use_implicit_tls,
        start_tls=use_starttls,
    ) as smtp:
        if settings.smtp_user and settings.smtp_password:
            await smtp.login(settings.smtp_user, settings.smtp_password)
        await smtp.send_message(msg, recipients=recipients)
    return "elküldve"

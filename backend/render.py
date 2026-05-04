from __future__ import annotations

from email_validator import EmailNotValidError, validate_email

from backend.csv_tools import replace_placeholders


def render_row(
    template: str,
    subject_template: str,
    row: dict[str, str],
) -> tuple[str, str, list[str]]:
    body, missing_body = replace_placeholders(template, row)
    subject, missing_subj = replace_placeholders(subject_template, row)
    missing = sorted(set(missing_body + missing_subj))
    return subject.strip(), body, missing


def normalize_email(addr: str) -> str:
    raw = (addr or "").strip()
    if not raw:
        raise ValueError("Üres e-mail mező ebben a sorban.")
    if "@" not in raw:
        raise ValueError(
            "Érvénytelen e-mail: nincs „@” jel. Gyakori ok: a felületen az „E-mail oszlop” "
            "helyett véletlenül a név (vagy más) oszlop van kiválasztva."
        )
    try:
        return validate_email(raw, check_deliverability=False).normalized
    except EmailNotValidError as e:
        raise ValueError(f"Érvénytelen e-mail: {e}") from e

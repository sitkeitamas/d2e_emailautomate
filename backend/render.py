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
    try:
        return validate_email(addr, check_deliverability=False).normalized
    except EmailNotValidError as e:
        raise ValueError(str(e)) from e

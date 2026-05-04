from __future__ import annotations

import csv
import io
import re

_PLACEHOLDER = re.compile(r"\{([^}]+)\}")


def sniff_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        class _Csv(csv.excel):  # type: ignore[misc]
            delimiter = ","

        return _Csv()


def _rows_from_dict_reader(reader: csv.DictReader) -> tuple[list[str], list[dict[str, str]]]:
    if not reader.fieldnames:
        raise ValueError("Az első sor (fejléc) hiányzik vagy üres.")

    fieldnames = [h.strip() for h in reader.fieldnames if h is not None]
    rows: list[dict[str, str]] = []
    for raw_row in reader:
        row: dict[str, str] = {}
        for k, v in raw_row.items():
            if k is None:
                continue
            key = k.strip()
            row[key] = (v or "").strip()
        if any(row.values()):
            rows.append(row)
    return fieldnames, rows


def parse_table_string(text: str) -> tuple[list[str], list[dict[str, str]]]:
    """CSV vagy Excelből bemásolt táblázat (TIPA: tabbal elválasztott első sor)."""
    text = text.strip().replace("\r\n", "\n").replace("\r", "\n")
    if not text:
        raise ValueError("Üres szöveg.")

    sample = text[:8192]
    first_line = sample.split("\n", 1)[0]
    if "\t" in first_line:
        reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    else:
        dialect = sniff_dialect(sample)
        reader = csv.DictReader(io.StringIO(text), dialect=dialect)

    return _rows_from_dict_reader(reader)


def parse_csv_bytes(raw: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = raw.decode("utf-8-sig")
    return parse_table_string(text)


def replace_placeholders(template: str, row: dict[str, str]) -> tuple[str, list[str]]:
    """Returns (rendered, missing_keys). Placeholders match {Header} keys from CSV."""

    indexes: dict[str, str] = {}
    for k in row.keys():
        indexes[_normalize_lookup(k)] = k

    missing: list[str] = []

    def _sub(m: re.Match[str]) -> str:
        inner = m.group(1).strip()
        nk = _normalize_lookup(inner)
        hk = indexes.get(nk)
        if hk is None:
            missing.append(inner)
            return m.group(0)
        return row.get(hk, "") or ""

    rendered = _PLACEHOLDER.sub(_sub, template)
    uniq_missing = sorted(set(missing))
    return rendered, uniq_missing


def _normalize_lookup(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip()).casefold()

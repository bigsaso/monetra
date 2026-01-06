from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel


class ParsedTransaction(BaseModel):
    date: date
    description: str
    amount: Decimal
    raw_category: str | None = None


class CSVParseResult(BaseModel):
    card_type: str
    rows: list[ParsedTransaction]


FIELD_MAPS: dict[str, dict[str, list[str]]] = {
    "amex": {
        "date": ["date", "transaction date", "trans date", "posting date", "date processed"],
        "description": ["description", "merchant", "details", "reference"],
        "amount": ["amount"],
        "category": ["category"],
    },
    "td": {
        "date": ["date", "transaction date", "trans date", "post date", "posting date"],
        "description": ["description", "merchant", "details"],
        "debit": ["debit", "withdrawal", "charge", "purchase"],
        "credit": ["credit", "deposit", "payment"],
        "amount": ["amount"],
        "category": ["category"],
    },
    "visa": {
        "date": ["transaction date", "trans date", "post date", "posting date", "date"],
        "description": ["description", "merchant", "merchant name", "details"],
        "amount": ["amount"],
        "debit": ["debit", "withdrawal", "charge", "purchase"],
        "credit": ["credit", "deposit", "payment"],
        "category": ["category"],
    },
}

VISA_HEADER_HINTS = {
    "transactiondate",
    "postdate",
    "postingdate",
    "debit",
    "credit",
}
AMEX_HEADER_HINTS = {"americanexpress", "amex", "merchant"}
HEADER_KEYWORDS = {
    "date",
    "dateprocessed",
    "transactiondate",
    "transdate",
    "postdate",
    "postingdate",
    "description",
    "merchant",
    "merchantname",
    "details",
    "reference",
    "amount",
    "debit",
    "credit",
    "withdrawal",
    "charge",
    "purchase",
    "deposit",
    "payment",
    "category",
    "balance",
}

DATE_FORMATS = ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y", "%d %b %Y", "%d %B %Y")


def parse_transactions_csv(contents: str) -> CSVParseResult:
    reader = csv.reader(io.StringIO(contents))
    rows = list(reader)
    if not rows:
        raise ValueError("CSV missing header row.")

    first_row = rows[0]
    if looks_like_header(first_row):
        fieldnames = first_row
        data_rows = rows[1:]
        inferred_card_type = None
    else:
        inferred = infer_header_from_row(first_row)
        if inferred is None:
            raise ValueError("Unsupported CSV format.")
        inferred_card_type, fieldnames = inferred
        data_rows = rows

    card_type = detect_card_type(fieldnames) or inferred_card_type
    if card_type is None:
        raise ValueError("Unsupported CSV format.")

    field_map = FIELD_MAPS[card_type]
    date_header = find_header(fieldnames, field_map["date"])
    description_header = find_header(fieldnames, field_map["description"])
    amount_header = find_header(fieldnames, field_map["amount"])
    category_header = find_header(fieldnames, field_map.get("category", []))
    debit_header = find_header(fieldnames, field_map.get("debit", []))
    credit_header = find_header(fieldnames, field_map.get("credit", []))

    if not date_header or not description_header or not (amount_header or debit_header):
        raise ValueError("CSV headers missing required fields.")

    raw_rows = [row_to_dict(fieldnames, row) for row in data_rows]
    positive_expense = None
    if amount_header:
        positive_expense = detect_amount_convention(raw_rows, amount_header)

    rows: list[ParsedTransaction] = []
    for row in raw_rows:
        parsed = parse_row(
            row,
            date_header=date_header,
            description_header=description_header,
            amount_header=amount_header,
            category_header=category_header,
            debit_header=debit_header,
            credit_header=credit_header,
            positive_expense=positive_expense,
        )
        if parsed is not None:
            rows.append(parsed)

    return CSVParseResult(card_type=card_type, rows=rows)


def looks_like_header(row: list[str]) -> bool:
    normalized = {normalize_header(value) for value in row if value}
    return bool(normalized & HEADER_KEYWORDS)


def infer_header_from_row(row: list[str]) -> tuple[str, list[str]] | None:
    if len(row) == 5 and parse_date(row[0]) is not None:
        debit_value = parse_decimal(row[2])
        credit_value = parse_decimal(row[3])
        if debit_value is not None or credit_value is not None:
            return "td", ["date", "description", "debit", "credit", "balance"]
    return None


def row_to_dict(fieldnames: list[str], row: list[str]) -> dict[str, str | None]:
    if len(row) < len(fieldnames):
        row = row + [""] * (len(fieldnames) - len(row))
    if len(row) > len(fieldnames):
        row = row[: len(fieldnames)]
    return dict(zip(fieldnames, row))


def detect_card_type(fieldnames: list[str]) -> str | None:
    normalized = {normalize_header(name) for name in fieldnames if name}
    if normalized & VISA_HEADER_HINTS:
        return "visa"
    if normalized & AMEX_HEADER_HINTS:
        return "amex"
    if {"amount", "date"} <= normalized:
        return "amex"
    return None


def parse_row(
    row: dict[str, str | None],
    *,
    date_header: str,
    description_header: str,
    amount_header: str | None,
    category_header: str | None,
    debit_header: str | None,
    credit_header: str | None,
    positive_expense: bool | None,
) -> ParsedTransaction | None:
    if is_blank_row(row):
        return None

    date_value = parse_date(row.get(date_header))
    if date_value is None:
        return None

    description = clean_text(row.get(description_header))
    if not description:
        return None

    amount = parse_amount(row, amount_header, debit_header, credit_header, positive_expense)
    if amount is None or amount >= 0:
        return None

    raw_category = clean_text(row.get(category_header)) if category_header else None

    return ParsedTransaction(
        date=date_value,
        description=description,
        amount=amount,
        raw_category=raw_category or None,
    )


def parse_amount(
    row: dict[str, str | None],
    amount_header: str | None,
    debit_header: str | None,
    credit_header: str | None,
    positive_expense: bool | None,
) -> Decimal | None:
    if debit_header:
        debit_value = parse_decimal(row.get(debit_header))
        if debit_value and debit_value > 0:
            return -abs(debit_value)

    if credit_header:
        credit_value = parse_decimal(row.get(credit_header))
        if credit_value and credit_value > 0:
            return None

    if amount_header:
        amount_value = parse_decimal(row.get(amount_header))
        if amount_value is None or amount_value == 0:
            return None
        if positive_expense is False:
            if amount_value >= 0:
                return None
            return amount_value
        if amount_value <= 0:
            return None
        return -amount_value

    return None


def parse_date(value: str | None) -> date | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    try:
        return date.fromisoformat(cleaned)
    except ValueError:
        return None


def parse_decimal(value: str | None) -> Decimal | None:
    cleaned = clean_text(value)
    if not cleaned:
        return None

    negative = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        negative = True
        cleaned = cleaned[1:-1]

    cleaned = cleaned.replace("$", "").replace(",", "")
    cleaned = re.sub(r"\s+", "", cleaned)

    if cleaned.startswith("-"):
        negative = True
        cleaned = cleaned[1:]
    elif cleaned.startswith("+"):
        cleaned = cleaned[1:]

    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return None

    return -amount if negative else amount


def find_header(fieldnames: list[str], candidates: list[str]) -> str | None:
    normalized = [(name, normalize_header(name)) for name in fieldnames if name]
    for candidate in candidates:
        cand_norm = normalize_header(candidate)
        for name, norm in normalized:
            if norm == cand_norm:
                return name
    for candidate in candidates:
        cand_norm = normalize_header(candidate)
        for name, norm in normalized:
            if cand_norm and cand_norm in norm:
                return name
    return None


def detect_amount_convention(rows: list[dict[str, str | None]], amount_header: str) -> bool:
    positive = 0
    negative = 0
    for row in rows:
        amount_value = parse_decimal(row.get(amount_header))
        if amount_value is None or amount_value == 0:
            continue
        if amount_value > 0:
            positive += 1
        else:
            negative += 1
        if positive + negative >= 10:
            break
    return positive >= negative


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower())


def clean_text(value: str | None) -> str:
    return value.strip() if value else ""


def is_blank_row(row: dict[str, str | None]) -> bool:
    return all(not clean_text(value) for value in row.values())

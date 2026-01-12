from __future__ import annotations

from dataclasses import dataclass
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable, List, Dict, Set

WEEKLY_DAYS = 7
BIWEEKLY_DAYS = 14
SUPPORTED_FREQUENCIES = {"weekly", "biweekly", "monthly", "yearly"}
SUPPORTED_KINDS = {"income", "expense", "investment"}

KIND_TO_PROJECTION = {
    "income": ("income", False),
    "expense": ("expense", False),
    "investment": ("expense", True),
}
KIND_TO_ACTUAL_TYPES = {
    "income": {"income"},
    "expense": {"expense"},
    "investment": {"investment"},
}


@dataclass(frozen=True)
class RecurringSchedule:
    amount: Decimal
    start_date: date
    account_id: int
    currency: str | None = None
    frequency: str = "biweekly"
    kind: str = "income"
    category_id: int | None = None
    notes: str | None = None


@dataclass(frozen=True)
class ActualTransaction:
    date: date
    account_id: int
    type: str


@dataclass(frozen=True)
class ProjectedEntry:
    date: date
    amount: Decimal
    account_id: int
    transaction_type: str
    is_investment: bool = False
    source: str = "projected"
    notes: str | None = None


def project_recurring_schedule(
    schedule: RecurringSchedule,
    range_start: date,
    range_end: date,
    existing_transactions: Iterable[ActualTransaction],
) -> List[ProjectedEntry]:
    existing_index = _index_existing_transactions(existing_transactions)
    return _project_schedule(
        schedule,
        range_start,
        range_end,
        existing_index,
    )


def project_recurring_schedules(
    schedules: Iterable[RecurringSchedule],
    range_start: date,
    range_end: date,
    existing_transactions: Iterable[ActualTransaction],
) -> List[ProjectedEntry]:
    if range_start > range_end:
        raise ValueError("range_start must be on or before range_end.")
    existing_index = _index_existing_transactions(existing_transactions)
    projections: List[ProjectedEntry] = []
    for schedule in schedules:
        projections.extend(
            _project_schedule(
                schedule,
                range_start,
                range_end,
                existing_index,
                check_range=False,
            )
        )
    return projections


def _project_schedule(
    schedule: RecurringSchedule,
    range_start: date,
    range_end: date,
    existing_index: Dict[int, Dict[str, Set[date]]],
    check_range: bool = True,
) -> List[ProjectedEntry]:
    if check_range and range_start > range_end:
        raise ValueError("range_start must be on or before range_end.")
    if schedule.amount <= 0:
        raise ValueError("schedule.amount must be greater than zero.")
    normalized_frequency = _validate_frequency(schedule.frequency)
    normalized_kind = _validate_kind(schedule.kind)

    excluded_dates = _excluded_dates_for_schedule(schedule, normalized_kind, existing_index)
    if normalized_frequency in {"monthly", "yearly"}:
        if normalized_frequency == "monthly":
            first_date, month_offset = _first_monthly_on_or_after(
                schedule.start_date, range_start
            )
            month_increment = 1
        else:
            first_date, month_offset = _first_yearly_on_or_after(
                schedule.start_date, range_start
            )
            month_increment = 12
    else:
        interval = WEEKLY_DAYS if normalized_frequency == "weekly" else BIWEEKLY_DAYS
        first_date = _first_occurrence_on_or_after(
            schedule.start_date, range_start, interval
        )

    transaction_type, is_investment = KIND_TO_PROJECTION[normalized_kind]
    projections: List[ProjectedEntry] = []
    current_date = first_date
    while current_date <= range_end:
        if current_date not in excluded_dates:
            projections.append(
                ProjectedEntry(
                    date=current_date,
                    amount=_coerce_amount(schedule.amount),
                    account_id=schedule.account_id,
                    transaction_type=transaction_type,
                    is_investment=is_investment,
                    notes=schedule.notes,
                )
            )
        if normalized_frequency in {"monthly", "yearly"}:
            month_offset += month_increment
            current_date = _add_months(
                schedule.start_date, month_offset, schedule.start_date.day
            )
        else:
            current_date += timedelta(days=interval)

    return projections


def _validate_frequency(frequency: str) -> str:
    normalized = _normalize_frequency(frequency)
    if normalized == "byweekly":
        normalized = "biweekly"
    if normalized not in SUPPORTED_FREQUENCIES:
        raise ValueError("Only weekly, biweekly, monthly, or yearly schedules are supported.")
    return normalized


def _normalize_frequency(value: str) -> str:
    return "".join(ch for ch in value.strip().lower() if ch.isalnum())


def _validate_kind(kind: str) -> str:
    normalized = _normalize_kind(kind)
    if normalized not in SUPPORTED_KINDS:
        raise ValueError("Only income, expense, or investment schedules are supported.")
    return normalized


def _normalize_kind(value: str) -> str:
    return value.strip().lower()


def _excluded_dates_for_schedule(
    schedule: RecurringSchedule,
    normalized_kind: str,
    existing_index: Dict[int, Dict[str, Set[date]]],
) -> Set[date]:
    excluded: Set[date] = set()
    account_index = existing_index.get(schedule.account_id, {})
    for actual_type in KIND_TO_ACTUAL_TYPES[normalized_kind]:
        excluded.update(account_index.get(actual_type, set()))
    return excluded


def _first_occurrence_on_or_after(
    start_date: date, minimum_date: date, interval_days: int
) -> date:
    if start_date >= minimum_date:
        return start_date
    days_between = (minimum_date - start_date).days
    intervals = (days_between + interval_days - 1) // interval_days
    return start_date + timedelta(days=interval_days * intervals)


def _first_monthly_on_or_after(start_date: date, minimum_date: date) -> tuple[date, int]:
    if start_date >= minimum_date:
        return start_date, 0
    months_between = (minimum_date.year - start_date.year) * 12 + (
        minimum_date.month - start_date.month
    )
    candidate = _add_months(start_date, months_between, start_date.day)
    if candidate < minimum_date:
        months_between += 1
        candidate = _add_months(start_date, months_between, start_date.day)
    return candidate, months_between


def _first_yearly_on_or_after(start_date: date, minimum_date: date) -> tuple[date, int]:
    if start_date >= minimum_date:
        return start_date, 0
    years_between = minimum_date.year - start_date.year
    months_between = years_between * 12
    candidate = _add_months(start_date, months_between, start_date.day)
    if candidate < minimum_date:
        months_between += 12
        candidate = _add_months(start_date, months_between, start_date.day)
    return candidate, months_between


def _add_months(start_date: date, months: int, anchor_day: int) -> date:
    total_month = start_date.month - 1 + months
    year = start_date.year + total_month // 12
    month = total_month % 12 + 1
    last_day = monthrange(year, month)[1]
    day = min(anchor_day, last_day)
    return date(year, month, day)


def _index_existing_transactions(
    existing_transactions: Iterable[ActualTransaction],
) -> Dict[int, Dict[str, Set[date]]]:
    index: Dict[int, Dict[str, Set[date]]] = {}
    for txn in existing_transactions:
        account_index = index.setdefault(txn.account_id, {})
        normalized_type = _normalize_kind(txn.type)
        account_index.setdefault(normalized_type, set()).add(txn.date)
    return index


def _coerce_amount(amount: Decimal) -> Decimal:
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))

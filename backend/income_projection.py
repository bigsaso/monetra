from __future__ import annotations

from dataclasses import dataclass
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable, List, Set

WEEKLY_DAYS = 7
BIWEEKLY_DAYS = 14
SUPPORTED_FREQUENCIES = {"weekly", "biweekly", "monthly"}


@dataclass(frozen=True)
class PaySchedule:
    amount: Decimal
    start_date: date
    account_id: int
    frequency: str = "biweekly"


@dataclass(frozen=True)
class IncomeTransaction:
    date: date
    amount: Decimal
    account_id: int


@dataclass(frozen=True)
class ProjectedIncome:
    date: date
    amount: Decimal
    account_id: int
    source: str = "projected"


def project_income(
    schedule: PaySchedule,
    range_start: date,
    range_end: date,
    existing_income: Iterable[IncomeTransaction],
) -> List[ProjectedIncome]:
    if range_start > range_end:
        raise ValueError("range_start must be on or before range_end.")
    if schedule.amount <= 0:
        raise ValueError("schedule.amount must be greater than zero.")
    normalized_frequency = _validate_frequency(schedule.frequency)

    excluded_dates = _collect_existing_dates(existing_income)
    if normalized_frequency == "monthly":
        first_date, month_offset = _first_monthly_on_or_after(
            schedule.start_date, range_start
        )
    else:
        interval = WEEKLY_DAYS if normalized_frequency == "weekly" else BIWEEKLY_DAYS
        first_date = _first_occurrence_on_or_after(
            schedule.start_date, range_start, interval
        )

    projections: List[ProjectedIncome] = []
    current_date = first_date
    while current_date <= range_end:
        if current_date not in excluded_dates:
            projections.append(
                ProjectedIncome(
                    date=current_date,
                    amount=_coerce_amount(schedule.amount),
                    account_id=schedule.account_id,
                )
            )
        if normalized_frequency == "monthly":
            month_offset += 1
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
        raise ValueError("Only weekly, biweekly, or monthly schedules are supported.")
    return normalized


def _normalize_frequency(value: str) -> str:
    return "".join(ch for ch in value.strip().lower() if ch.isalnum())


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


def _add_months(start_date: date, months: int, anchor_day: int) -> date:
    total_month = start_date.month - 1 + months
    year = start_date.year + total_month // 12
    month = total_month % 12 + 1
    last_day = monthrange(year, month)[1]
    day = min(anchor_day, last_day)
    return date(year, month, day)


def _collect_existing_dates(
    existing_income: Iterable[IncomeTransaction],
) -> Set[date]:
    return {txn.date for txn in existing_income}


def _coerce_amount(amount: Decimal) -> Decimal:
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))

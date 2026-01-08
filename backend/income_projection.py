from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable, List

from backend.recurring_projection import (
    ActualTransaction,
    RecurringSchedule,
    project_recurring_schedule,
)


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
    schedule: RecurringSchedule,
    range_start: date,
    range_end: date,
    existing_income: Iterable[IncomeTransaction],
) -> List[ProjectedIncome]:
    schedule_for_projection = RecurringSchedule(
        amount=schedule.amount,
        start_date=schedule.start_date,
        account_id=schedule.account_id,
        frequency=schedule.frequency,
        kind="income",
    )
    actual_transactions = [
        ActualTransaction(
            date=txn.date,
            account_id=txn.account_id,
            type="income",
        )
        for txn in existing_income
    ]
    projections = project_recurring_schedule(
        schedule_for_projection,
        range_start,
        range_end,
        actual_transactions,
    )
    return [
        ProjectedIncome(
            date=projection.date,
            amount=projection.amount,
            account_id=projection.account_id,
            source=projection.source,
        )
        for projection in projections
    ]

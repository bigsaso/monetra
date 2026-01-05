from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional

ZERO = Decimal("0")


@dataclass(frozen=True)
class Transaction:
    amount: Decimal
    type: str
    date: date
    category: Optional[str] = None
    account_id: Optional[int] = None


@dataclass(frozen=True)
class BudgetRule:
    rule_type: str
    amount: Decimal
    category: Optional[str] = None
    account_id: Optional[int] = None


@dataclass(frozen=True)
class BudgetEvaluation:
    current_value: Decimal
    remaining: Decimal
    status: str


def evaluate_budget(
    transactions: Iterable[Transaction],
    rule: BudgetRule,
    start_date: date,
    end_date: date,
) -> BudgetEvaluation:
    if start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")
    if rule.amount <= ZERO:
        raise ValueError("rule.amount must be greater than zero.")

    rule_type = rule.rule_type.strip().lower()
    filtered = [
        txn
        for txn in transactions
        if start_date <= txn.date <= end_date
    ]

    if rule_type == "category_cap":
        if not rule.category:
            raise ValueError("category_cap requires a category.")
        current_value = _sum_expenses(
            filtered,
            category=rule.category,
        )
        remaining = rule.amount - current_value
        status = "ok" if current_value <= rule.amount else "over"
    elif rule_type == "account_cap":
        if rule.account_id is None:
            raise ValueError("account_cap requires an account_id.")
        current_value = _sum_expenses(
            filtered,
            account_id=rule.account_id,
        )
        remaining = rule.amount - current_value
        status = "ok" if current_value <= rule.amount else "over"
    elif rule_type == "savings_target":
        income = _sum_income(filtered)
        expenses = _sum_expenses(filtered)
        current_value = income - expenses
        remaining = rule.amount - current_value
        status = "met" if current_value >= rule.amount else "short"
    else:
        raise ValueError(f"Unsupported rule_type: {rule.rule_type}")

    return BudgetEvaluation(
        current_value=current_value,
        remaining=remaining,
        status=status,
    )


def _sum_expenses(
    transactions: Iterable[Transaction],
    *,
    category: Optional[str] = None,
    account_id: Optional[int] = None,
) -> Decimal:
    total = ZERO
    for txn in transactions:
        txn_type = txn.type.strip().lower()
        if txn_type != "expense":
            continue
        if category is not None and txn.category != category:
            continue
        if account_id is not None and txn.account_id != account_id:
            continue
        total += _coerce_amount(txn.amount)
    return total


def _sum_income(transactions: Iterable[Transaction]) -> Decimal:
    total = ZERO
    for txn in transactions:
        txn_type = txn.type.strip().lower()
        if txn_type != "income":
            continue
        total += _coerce_amount(txn.amount)
    return total


def _coerce_amount(amount: Decimal) -> Decimal:
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))

import unittest
from datetime import date
from decimal import Decimal

from backend.budget_engine import BudgetRule, Transaction, evaluate_budget


class BudgetEngineTests(unittest.TestCase):
    def test_category_cap_sums_matching_expenses(self) -> None:
        transactions = [
            Transaction(
                amount=Decimal("50"),
                type="expense",
                category="Food",
                account_id=1,
                date=date(2024, 5, 1),
            ),
            Transaction(
                amount=Decimal("25"),
                type="expense",
                category="Food",
                account_id=1,
                date=date(2024, 5, 3),
            ),
            Transaction(
                amount=Decimal("10"),
                type="expense",
                category="Travel",
                account_id=2,
                date=date(2024, 5, 2),
            ),
            Transaction(
                amount=Decimal("100"),
                type="income",
                category=None,
                account_id=1,
                date=date(2024, 5, 2),
            ),
        ]
        rule = BudgetRule(
            rule_type="category_cap",
            amount=Decimal("100"),
            category="Food",
        )

        result = evaluate_budget(
            transactions,
            rule,
            start_date=date(2024, 5, 1),
            end_date=date(2024, 5, 31),
        )

        self.assertEqual(result.current_value, Decimal("75"))
        self.assertEqual(result.remaining, Decimal("25"))
        self.assertEqual(result.status, "ok")

    def test_account_cap_filters_date_range(self) -> None:
        transactions = [
            Transaction(
                amount=Decimal("40"),
                type="expense",
                category="Food",
                account_id=3,
                date=date(2024, 6, 1),
            ),
            Transaction(
                amount=Decimal("20"),
                type="expense",
                category="Food",
                account_id=3,
                date=date(2024, 5, 30),
            ),
        ]
        rule = BudgetRule(
            rule_type="account_cap",
            amount=Decimal("50"),
            account_id=3,
        )

        result = evaluate_budget(
            transactions,
            rule,
            start_date=date(2024, 6, 1),
            end_date=date(2024, 6, 30),
        )

        self.assertEqual(result.current_value, Decimal("40"))
        self.assertEqual(result.remaining, Decimal("10"))
        self.assertEqual(result.status, "ok")

    def test_savings_target_uses_income_minus_expenses(self) -> None:
        transactions = [
            Transaction(
                amount=Decimal("1000"),
                type="income",
                category=None,
                account_id=1,
                date=date(2024, 7, 1),
            ),
            Transaction(
                amount=Decimal("400"),
                type="expense",
                category="Rent",
                account_id=1,
                date=date(2024, 7, 2),
            ),
        ]
        rule = BudgetRule(
            rule_type="savings_target",
            amount=Decimal("500"),
        )

        result = evaluate_budget(
            transactions,
            rule,
            start_date=date(2024, 7, 1),
            end_date=date(2024, 7, 31),
        )

        self.assertEqual(result.current_value, Decimal("600"))
        self.assertEqual(result.remaining, Decimal("-100"))
        self.assertEqual(result.status, "met")


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import date
from decimal import Decimal

from backend.recurring_projection import (
    ActualTransaction,
    ProjectedEntry,
    RecurringSchedule,
    project_recurring_schedule,
)


class RecurringProjectionTests(unittest.TestCase):
    def test_projects_expense_schedule_and_excludes_actuals(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("120"),
            start_date=date(2024, 1, 1),
            account_id=2,
            frequency="weekly",
            kind="expense",
        )
        existing = [
            ActualTransaction(
                date=date(2024, 1, 8),
                account_id=2,
                type="expense",
            )
        ]

        projections = project_recurring_schedule(
            schedule,
            range_start=date(2024, 1, 1),
            range_end=date(2024, 1, 20),
            existing_transactions=existing,
        )

        expected = [
            ProjectedEntry(
                date=date(2024, 1, 1),
                amount=Decimal("120"),
                account_id=2,
                transaction_type="expense",
                is_investment=False,
            ),
            ProjectedEntry(
                date=date(2024, 1, 15),
                amount=Decimal("120"),
                account_id=2,
                transaction_type="expense",
                is_investment=False,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_projects_investment_schedule_as_expense_with_flag(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("500"),
            start_date=date(2024, 1, 5),
            account_id=9,
            frequency="biweekly",
            kind="investment",
        )
        existing = [
            ActualTransaction(
                date=date(2024, 1, 19),
                account_id=9,
                type="investment",
            )
        ]

        projections = project_recurring_schedule(
            schedule,
            range_start=date(2024, 1, 1),
            range_end=date(2024, 2, 10),
            existing_transactions=existing,
        )

        expected = [
            ProjectedEntry(
                date=date(2024, 1, 5),
                amount=Decimal("500"),
                account_id=9,
                transaction_type="expense",
                is_investment=True,
            ),
            ProjectedEntry(
                date=date(2024, 2, 2),
                amount=Decimal("500"),
                account_id=9,
                transaction_type="expense",
                is_investment=True,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_projects_yearly_schedule_with_day_clamp(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("75"),
            start_date=date(2024, 2, 29),
            account_id=4,
            frequency="yearly",
            kind="expense",
        )

        projections = project_recurring_schedule(
            schedule,
            range_start=date(2024, 1, 1),
            range_end=date(2026, 3, 1),
            existing_transactions=[],
        )

        expected = [
            ProjectedEntry(
                date=date(2024, 2, 29),
                amount=Decimal("75"),
                account_id=4,
                transaction_type="expense",
                is_investment=False,
            ),
            ProjectedEntry(
                date=date(2025, 2, 28),
                amount=Decimal("75"),
                account_id=4,
                transaction_type="expense",
                is_investment=False,
            ),
            ProjectedEntry(
                date=date(2026, 2, 28),
                amount=Decimal("75"),
                account_id=4,
                transaction_type="expense",
                is_investment=False,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_projects_notes_on_schedule(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("45"),
            start_date=date(2024, 5, 1),
            account_id=7,
            frequency="monthly",
            kind="expense",
            notes="Gym membership",
        )

        projections = project_recurring_schedule(
            schedule,
            range_start=date(2024, 5, 1),
            range_end=date(2024, 5, 31),
            existing_transactions=[],
        )

        self.assertEqual(
            projections,
            [
                ProjectedEntry(
                    date=date(2024, 5, 1),
                    amount=Decimal("45"),
                    account_id=7,
                    transaction_type="expense",
                    is_investment=False,
                    notes="Gym membership",
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()

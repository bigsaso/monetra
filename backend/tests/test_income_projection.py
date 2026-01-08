import unittest
from datetime import date
from decimal import Decimal

from backend.income_projection import (
    IncomeTransaction,
    RecurringSchedule,
    ProjectedIncome,
    project_income,
)


class IncomeProjectionTests(unittest.TestCase):
    def test_projects_biweekly_dates_and_excludes_existing(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("1500"),
            start_date=date(2024, 1, 5),
            account_id=10,
            frequency="bi-weekly",
        )
        existing = [
            IncomeTransaction(
                date=date(2024, 1, 19),
                amount=Decimal("1500"),
                account_id=10,
            )
        ]

        projections = project_income(
            schedule,
            range_start=date(2024, 1, 1),
            range_end=date(2024, 2, 15),
            existing_income=existing,
        )

        expected = [
            ProjectedIncome(
                date=date(2024, 1, 5),
                amount=Decimal("1500"),
                account_id=10,
            ),
            ProjectedIncome(
                date=date(2024, 2, 2),
                amount=Decimal("1500"),
                account_id=10,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_returns_empty_when_range_before_start_date(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("2000"),
            start_date=date(2024, 3, 1),
            account_id=7,
            frequency="biweekly",
        )

        projections = project_income(
            schedule,
            range_start=date(2024, 2, 1),
            range_end=date(2024, 2, 28),
            existing_income=[],
        )

        self.assertEqual(projections, [])

    def test_projects_weekly_dates(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("850"),
            start_date=date(2024, 1, 3),
            account_id=4,
            frequency="weekly",
        )

        projections = project_income(
            schedule,
            range_start=date(2024, 1, 1),
            range_end=date(2024, 1, 20),
            existing_income=[],
        )

        expected = [
            ProjectedIncome(
                date=date(2024, 1, 3),
                amount=Decimal("850"),
                account_id=4,
            ),
            ProjectedIncome(
                date=date(2024, 1, 10),
                amount=Decimal("850"),
                account_id=4,
            ),
            ProjectedIncome(
                date=date(2024, 1, 17),
                amount=Decimal("850"),
                account_id=4,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_projects_monthly_dates_with_day_clamp(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("3000"),
            start_date=date(2024, 1, 31),
            account_id=9,
            frequency="monthly",
        )

        projections = project_income(
            schedule,
            range_start=date(2024, 2, 1),
            range_end=date(2024, 4, 30),
            existing_income=[],
        )

        expected = [
            ProjectedIncome(
                date=date(2024, 2, 29),
                amount=Decimal("3000"),
                account_id=9,
            ),
            ProjectedIncome(
                date=date(2024, 3, 31),
                amount=Decimal("3000"),
                account_id=9,
            ),
            ProjectedIncome(
                date=date(2024, 4, 30),
                amount=Decimal("3000"),
                account_id=9,
            ),
        ]
        self.assertEqual(projections, expected)

    def test_rejects_unsupported_frequency(self) -> None:
        schedule = RecurringSchedule(
            amount=Decimal("1200"),
            start_date=date(2024, 4, 1),
            account_id=3,
            frequency="quarterly",
        )

        with self.assertRaises(ValueError):
            project_income(
                schedule,
                range_start=date(2024, 4, 1),
                range_end=date(2024, 4, 30),
                existing_income=[],
            )


if __name__ == "__main__":
    unittest.main()

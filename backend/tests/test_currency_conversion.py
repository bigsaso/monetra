import unittest
from decimal import Decimal

from backend.currency_conversion import (
    CompositeRateProvider,
    RateProviderUnavailable,
    StaticRateProvider,
    convert_amount,
)


class CurrencyConversionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.provider = StaticRateProvider(
            rates={
                "USD": Decimal("1"),
                "EUR": Decimal("2"),
                "JPY": Decimal("4"),
            }
        )

    def test_same_currency_returns_original_amount(self) -> None:
        amount = convert_amount(
            Decimal("12.50"),
            "USD",
            "USD",
            rate_provider=self.provider,
        )

        self.assertEqual(amount, Decimal("12.50"))

    def test_conversion_uses_usd_base_rates(self) -> None:
        amount = convert_amount(
            Decimal("10"),
            "EUR",
            "JPY",
            rate_provider=self.provider,
        )

        self.assertEqual(amount, Decimal("20"))

    def test_normalizes_currency_codes(self) -> None:
        amount = convert_amount(
            Decimal("6"),
            " eur ",
            "jpy",
            rate_provider=self.provider,
        )

        self.assertEqual(amount, Decimal("12"))

    def test_missing_currency_raises(self) -> None:
        with self.assertRaises(ValueError):
            convert_amount(
                Decimal("5"),
                "USD",
                "CAD",
                rate_provider=self.provider,
            )

    def test_falls_back_when_live_provider_unavailable(self) -> None:
        class UnavailableProvider:
            def get_rate(self, currency: str, date=None) -> Decimal:
                raise RateProviderUnavailable("Down")

        provider = CompositeRateProvider(
            primary=UnavailableProvider(),
            fallback=self.provider,
        )

        amount = convert_amount(
            Decimal("10"),
            "EUR",
            "JPY",
            rate_provider=provider,
        )

        self.assertEqual(amount, Decimal("20"))


if __name__ == "__main__":
    unittest.main()

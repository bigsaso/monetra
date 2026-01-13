from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
import json
import time
from typing import Mapping
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

DEFAULT_RATES: dict[str, Decimal] = {
    "USD": Decimal("1"),
    "EUR": Decimal("0.92"),
    "GBP": Decimal("0.79"),
    "JPY": Decimal("147.50"),
    "CAD": Decimal("1.34"),
    "AUD": Decimal("1.52"),
    "NZD": Decimal("1.64"),
    "CHF": Decimal("0.88"),
    "SEK": Decimal("10.45"),
}


@dataclass(frozen=True)
class StaticRateProvider:
    """Deterministic, in-memory FX rates.

    Rates are expressed as target currency per 1 USD.
    """

    rates: Mapping[str, Decimal] = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "rates", dict(self.rates or DEFAULT_RATES))

    def get_rate(self, currency: str, date: date | str | None = None) -> Decimal:
        normalized = normalize_currency(currency)
        try:
            return self.rates[normalized]
        except KeyError as exc:
            raise ValueError(f"Unsupported currency: {normalized}") from exc


class RateProviderUnavailable(RuntimeError):
    """Raised when a rate provider cannot fetch live rates."""


@dataclass(frozen=True)
class CachedRates:
    rates: Mapping[str, Decimal]
    expires_at: float | None


@dataclass
class FrankfurterRateProvider:
    base_currency: str = "USD"
    base_url: str = "https://api.frankfurter.app"
    cache_ttl_seconds: int = 12 * 60 * 60
    _cache: dict[tuple[str, str], CachedRates] = field(default_factory=dict)

    def get_rate(self, currency: str, date: date | str | None = None) -> Decimal:
        normalized = normalize_currency(currency)
        base_currency = normalize_currency(self.base_currency)
        if normalized == base_currency:
            return Decimal("1")

        date_key = _normalize_rate_date(date)
        rates = self._get_rates(base_currency, date_key)
        try:
            return rates[normalized]
        except KeyError as exc:
            raise ValueError(f"Unsupported currency: {normalized}") from exc

    def _get_rates(self, base_currency: str, date_key: str | None) -> Mapping[str, Decimal]:
        cache_key = (base_currency, date_key or "latest")
        cached = self._cache.get(cache_key)
        now = time.monotonic()
        if cached and (cached.expires_at is None or cached.expires_at > now):
            return cached.rates

        rates = self._fetch_rates(base_currency, date_key)
        expires_at = None
        if date_key is None:
            expires_at = now + self.cache_ttl_seconds
        self._cache[cache_key] = CachedRates(rates=rates, expires_at=expires_at)
        return rates

    def _fetch_rates(self, base_currency: str, date_key: str | None) -> Mapping[str, Decimal]:
        endpoint = date_key or "latest"
        url = f"{self.base_url}/{endpoint}?from={base_currency}"
        try:
            with urlopen(url, timeout=8) as response:
                payload = json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RateProviderUnavailable("Frankfurter API unavailable") from exc

        rates = payload.get("rates")
        if not isinstance(rates, dict):
            raise RateProviderUnavailable("Frankfurter response missing rates")

        parsed = {normalize_currency(code): Decimal(str(value)) for code, value in rates.items()}
        parsed[base_currency] = Decimal("1")
        return parsed


@dataclass(frozen=True)
class CompositeRateProvider:
    primary: StaticRateProvider | FrankfurterRateProvider
    fallback: StaticRateProvider

    def get_rate(self, currency: str, date: date | str | None = None) -> Decimal:
        try:
            return self.primary.get_rate(currency, date=date)
        except RateProviderUnavailable:
            return self.fallback.get_rate(currency, date=date)


def convert_amount(
    amount: Decimal | int | float | str,
    source_currency: str,
    target_currency: str,
    rate_provider: StaticRateProvider | FrankfurterRateProvider | CompositeRateProvider | None = None,
    date: date | str | None = None,
) -> Decimal:
    """Convert a monetary amount for display using deterministic FX rates."""
    provider = rate_provider or StaticRateProvider()
    normalized_source = normalize_currency(source_currency)
    normalized_target = normalize_currency(target_currency)
    coerced_amount = _coerce_amount(amount)

    if normalized_source == normalized_target:
        return coerced_amount

    source_rate = provider.get_rate(normalized_source, date=date)
    target_rate = provider.get_rate(normalized_target, date=date)
    amount_in_usd = coerced_amount / source_rate
    return amount_in_usd * target_rate


def normalize_currency(value: str) -> str:
    normalized = value.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise ValueError("Currency must be a 3-letter ISO 4217 code.")
    return normalized


def _coerce_amount(amount: Decimal | int | float | str) -> Decimal:
    if isinstance(amount, Decimal):
        return amount
    return Decimal(str(amount))


def _normalize_rate_date(value: date | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Date must be in YYYY-MM-DD format.") from exc
    return parsed.isoformat()

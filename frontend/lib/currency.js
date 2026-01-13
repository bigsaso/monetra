"use client";

const DEFAULT_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 147.5,
  CAD: 1.34,
  AUD: 1.52,
  NZD: 1.64,
  CHF: 0.88,
  SEK: 10.45
};

export const normalizeCurrency = (value) => {
  if (!value) return "";
  return String(value).trim().toUpperCase();
};

export const getCurrencyFormatter = (currency, options = {}) => {
  const normalized = normalizeCurrency(currency) || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
    ...options
  });
};

export const convertAmount = (amount, sourceCurrency, targetCurrency) => {
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  const numericAmount = Number(amount || 0);
  if (!source || !target || !Number.isFinite(numericAmount)) {
    return numericAmount;
  }
  if (source === target) return numericAmount;
  const sourceRate = DEFAULT_RATES[source];
  const targetRate = DEFAULT_RATES[target];
  if (!sourceRate || !targetRate) {
    return numericAmount;
  }
  const amountInUsd = numericAmount / sourceRate;
  return amountInUsd * targetRate;
};

export const getConversionNote = (sourceCurrencies, homeCurrency) => {
  const normalizedHome = normalizeCurrency(homeCurrency);
  const normalizedSources = (sourceCurrencies || [])
    .map((currency) => normalizeCurrency(currency))
    .filter(Boolean);
  const uniqueSources = Array.from(new Set(normalizedSources));
  const nonHomeSources = uniqueSources.filter(
    (currency) => currency && currency !== normalizedHome
  );
  if (!nonHomeSources.length) return "";
  if (nonHomeSources.length === 1) {
    return `Converted from ${nonHomeSources[0]}`;
  }
  return `Converted from ${nonHomeSources.join(", ")}`;
};

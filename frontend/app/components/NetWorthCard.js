"use client";

import { useMemo } from "react";
import { getCurrencyFormatter } from "../../lib/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function NetWorthCard({
  className = "",
  summary,
  loading = false,
  error = "",
  homeCurrency = "USD"
}) {
  const currencyFormatter = useMemo(
    () => getCurrencyFormatter(homeCurrency),
    [homeCurrency]
  );

  const cash = toNumber(summary?.assets?.cash);
  const investments = toNumber(summary?.assets?.investments?.espp) +
    toNumber(summary?.assets?.investments?.rsu) +
    toNumber(summary?.assets?.investments?.other);
  const liabilities = toNumber(summary?.liabilities?.total_liabilities);
  const netWorth = toNumber(summary?.net_worth);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Net worth</CardTitle>
        <CardDescription>Assets minus liabilities.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p>Loading net worth...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && !summary ? (
          <p>No net worth data available yet.</p>
        ) : null}
        {!loading && !error && summary ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                As of today
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {currencyFormatter.format(netWorth)}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2">
                <span>Cash</span>
                <span className="font-medium text-slate-900">
                  {currencyFormatter.format(cash)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2">
                <span>Investments</span>
                <span className="font-medium text-slate-900">
                  {currencyFormatter.format(investments)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2">
                <span>Liabilities</span>
                <span className="font-medium text-slate-900">
                  {currencyFormatter.format(liabilities)}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

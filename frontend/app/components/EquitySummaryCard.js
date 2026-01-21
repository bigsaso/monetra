"use client";

import { useMemo } from "react";
import { getCurrencyFormatter } from "../../lib/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "./ui/table";

const formatSigned = (value, formatter) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatter.format(Math.abs(amount))}`;
};

const getPnlClass = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    return "text-slate-600";
  }
  return amount > 0 ? "text-emerald-600" : "text-rose-600";
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function EquitySummaryCard({
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
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    []
  );
  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
      }),
    []
  );

  const unvested = summary?.unvested?.rsu || {};
  const vestedUnrealized = summary?.vested_unrealized || {};
  const vestedRealized = summary?.vested_realized || {};
  const esppUnrealized = vestedUnrealized.espp || {};
  const rsuUnrealized = vestedUnrealized.rsu || {};
  const esppRealized = vestedRealized.espp || {};
  const rsuRealized = vestedRealized.rsu || {};

  const totalUnrealizedShares = toNumber(esppUnrealized.shares) + toNumber(rsuUnrealized.shares);
  const totalUnrealizedValue = toNumber(esppUnrealized.value) + toNumber(rsuUnrealized.value);
  const totalUnrealizedCostBasis =
    toNumber(esppUnrealized.cost_basis) + toNumber(rsuUnrealized.cost_basis);
  const totalUnrealizedPnl = toNumber(esppUnrealized.pnl) + toNumber(rsuUnrealized.pnl);
  const totalUnrealizedPnlPct =
    totalUnrealizedCostBasis !== 0 ? totalUnrealizedPnl / totalUnrealizedCostBasis : 0;

  const totalRealizedShares = toNumber(esppRealized.shares) + toNumber(rsuRealized.shares);
  const totalRealizedValue = toNumber(esppRealized.value) + toNumber(rsuRealized.value);
  const totalRealizedPnl = toNumber(esppRealized.pnl) + toNumber(rsuRealized.pnl);
  const totalRealizedCostBasis =
    (toNumber(esppRealized.value) - toNumber(esppRealized.pnl)) +
    (toNumber(rsuRealized.value) - toNumber(rsuRealized.pnl));
  const totalRealizedPnlPct =
    totalRealizedCostBasis !== 0 ? totalRealizedPnl / totalRealizedCostBasis : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Equity exposure</CardTitle>
        <CardDescription>
          Combined ESPP + RSU snapshot across unvested, unrealized, and realized states.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p>Loading equity summary...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && !summary ? <p>No equity data available yet.</p> : null}
        {!loading && !error && summary ? (
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Unvested
                  </p>
                  <p className="text-sm text-slate-500">RSU only</p>
                </div>
              </div>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">RSU</TableCell>
                    <TableCell className="text-right">
                      {quantityFormatter.format(toNumber(unvested.shares))}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(toNumber(unvested.value))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>

            <section className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Vested - Unrealized
                  </p>
                  <p className="text-sm text-slate-500">Held shares at current value.</p>
                </div>
              </div>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">P/L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">ESPP</TableCell>
                    <TableCell className="text-right">
                      {quantityFormatter.format(toNumber(esppUnrealized.shares))}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(toNumber(esppUnrealized.value))}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(esppUnrealized.pnl)}`}>
                      {formatSigned(esppUnrealized.pnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(esppUnrealized.pnl)}`}>
                      {formatSigned(esppUnrealized.pnl_pct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">RSU</TableCell>
                    <TableCell className="text-right">
                      {quantityFormatter.format(toNumber(rsuUnrealized.shares))}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(toNumber(rsuUnrealized.value))}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(rsuUnrealized.pnl)}`}>
                      {formatSigned(rsuUnrealized.pnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(rsuUnrealized.pnl)}`}>
                      {formatSigned(rsuUnrealized.pnl_pct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">Total</TableCell>
                    <TableCell className="text-right font-semibold">
                      {quantityFormatter.format(totalUnrealizedShares)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {currencyFormatter.format(totalUnrealizedValue)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${getPnlClass(totalUnrealizedPnl)}`}>
                      {formatSigned(totalUnrealizedPnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${getPnlClass(totalUnrealizedPnl)}`}>
                      {formatSigned(totalUnrealizedPnlPct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </section>

            <section className="rounded-xl border border-slate-200/70 bg-white/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Vested - Realized
                  </p>
                  <p className="text-sm text-slate-500">Completed sales and outcomes.</p>
                </div>
              </div>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">P/L</TableHead>
                    <TableHead className="text-right">P/L %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">ESPP</TableCell>
                    <TableCell className="text-right">
                      {quantityFormatter.format(toNumber(esppRealized.shares))}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(toNumber(esppRealized.value))}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(esppRealized.pnl)}`}>
                      {formatSigned(esppRealized.pnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(esppRealized.pnl)}`}>
                      {formatSigned(esppRealized.pnl_pct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-slate-900">RSU</TableCell>
                    <TableCell className="text-right">
                      {quantityFormatter.format(toNumber(rsuRealized.shares))}
                    </TableCell>
                    <TableCell className="text-right">
                      {currencyFormatter.format(toNumber(rsuRealized.value))}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(rsuRealized.pnl)}`}>
                      {formatSigned(rsuRealized.pnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right ${getPnlClass(rsuRealized.pnl)}`}>
                      {formatSigned(rsuRealized.pnl_pct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold text-slate-900">Total</TableCell>
                    <TableCell className="text-right font-semibold">
                      {quantityFormatter.format(totalRealizedShares)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {currencyFormatter.format(totalRealizedValue)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${getPnlClass(totalRealizedPnl)}`}>
                      {formatSigned(totalRealizedPnl, currencyFormatter)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${getPnlClass(totalRealizedPnl)}`}>
                      {formatSigned(totalRealizedPnlPct, percentFormatter)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </section>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

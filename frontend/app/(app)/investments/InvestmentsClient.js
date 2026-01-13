"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../components/ui/table";

const emptyForm = { name: "", symbol: "", asset_type: "stock" };

const assetTypeOptions = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "crypto", label: "Crypto" },
  { value: "bond", label: "Bond" },
  { value: "cash", label: "Cash" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" }
];

const normalizeCurrencyValue = (value) =>
  String(value || "").trim().toUpperCase();

const isForeignCurrency = (currency, homeCurrency) => {
  const normalizedCurrency = normalizeCurrencyValue(currency);
  const normalizedHome = normalizeCurrencyValue(homeCurrency);
  if (!normalizedCurrency || !normalizedHome) {
    return false;
  }
  return normalizedCurrency !== normalizedHome;
};

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const normalizedCurrency = normalizeCurrencyValue(currency);
  if (!normalizedCurrency) {
    return amount.toFixed(2);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (err) {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

export default function InvestmentsClient() {
  const [positions, setPositions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [transactionCurrencyLookup, setTransactionCurrencyLookup] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertDate, setConvertDate] = useState("");
  const [convertError, setConvertError] = useState("");
  const [convertSaving, setConvertSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
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

  const loadPositions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/investments/positions");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investment positions.");
      }
      const data = await response.json();
      setPositions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const response = await fetch("/api/investments/activity");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investment activity.");
      }
      const data = await response.json();
      setActivity(data);
    } catch (err) {
      setActivityError(err.message);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadTransactionCurrencies = async () => {
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load transactions.");
      }
      const data = await response.json();
      const lookup = {};
      data.forEach((transaction) => {
        if (transaction?.id == null) {
          return;
        }
        lookup[transaction.id] = transaction.currency;
      });
      setTransactionCurrencyLookup(lookup);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const loadHomeCurrency = async () => {
    try {
      const response = await fetch("/api/user-settings");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load user settings.");
      }
      const data = await response.json();
      const resolved = String(data?.home_currency || "").trim().toUpperCase();
      if (resolved) {
        setHomeCurrency(resolved);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  useEffect(() => {
    loadPositions();
    loadActivity();
    loadTransactionCurrencies();
    loadHomeCurrency();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Enter an investment name.");
      return;
    }
    if (!form.asset_type) {
      setError("Select an asset type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        symbol: form.symbol,
        asset_type: form.asset_type
      };
      const response = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save investment.");
      }
      setForm(emptyForm);
      await loadPositions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertOpen = (entry) => {
    setConvertTarget(entry);
    setConvertDate(entry?.date || "");
    setConvertError("");
  };

  const handleConvertClose = () => {
    if (convertSaving) {
      return;
    }
    setConvertTarget(null);
    setConvertDate("");
    setConvertError("");
  };

  const handleConvertSubmit = async (event) => {
    event.preventDefault();
    if (!convertDate) {
      setConvertError("Select a conversion date.");
      return;
    }
    if (!convertTarget) {
      return;
    }
    setConvertSaving(true);
    setConvertError("");
    try {
      const response = await fetch("/api/currency/convert-to-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: convertTarget.id,
          conversion_date: convertDate
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to convert currency.");
      }
      await loadActivity();
      handleConvertClose();
    } catch (err) {
      setConvertError(err.message);
    } finally {
      setConvertSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-full px-4 py-10 sm:max-w-3xl">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        Investment assets
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Maintain the holdings you track and map to investment expenses.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add investment</CardTitle>
            <CardDescription>Store the tickers and asset types you track.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Symbol
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm text-slate-600">
                Asset type
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="asset_type"
                  value={form.asset_type}
                  onChange={handleChange}
                >
                  {assetTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  Add investment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current holdings</CardTitle>
            <CardDescription>Holdings based on weighted average cost.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {loading ? <p>Loading positions...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && positions.length === 0 ? (
              <p>No investment positions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investment</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Avg cost</TableHead>
                    <TableHead className="text-right">Cost basis</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.map((position) => (
                    <TableRow key={position.id}>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {position.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {position.symbol || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {quantityFormatter.format(Number(position.total_shares || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(position.average_cost_per_share, position.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(position.total_cost_basis, position.currency)}
                      </TableCell>
                      <TableCell>{position.currency || "-"}</TableCell>
                      <TableCell>
                        <Button asChild type="button" variant="outline">
                          <Link
                            href={`/transactions?investmentId=${position.id}&investmentAction=sell`}
                          >
                            Sell
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Investment activity</CardTitle>
            <CardDescription>Review buy and sell activity tied to transactions.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {activityLoading ? <p>Loading activity...</p> : null}
            {activityError ? (
              <p className="text-sm text-rose-600">{activityError}</p>
            ) : null}
            {!activityLoading && activity.length === 0 ? (
              <p>No investment activity yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investment</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {entry.investment_name}
                        {entry.investment_symbol
                          ? ` (${entry.investment_symbol})`
                          : ""}
                      </TableCell>
                      <TableCell className="capitalize">{entry.type}</TableCell>
                      <TableCell className="text-right">
                        {quantityFormatter.format(Number(entry.quantity || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {currencyFormatter.format(Number(entry.price || 0))}
                      </TableCell>
                      <TableCell>{entry.date}</TableCell>
                      <TableCell>
                        <Link
                          className="text-sm font-medium text-slate-700 hover:text-slate-900"
                          href={`/transactions?transactionId=${entry.transaction_id}`}
                        >
                          View transaction #{entry.transaction_id}
                        </Link>
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        {isForeignCurrency(
                          transactionCurrencyLookup[entry.transaction_id],
                          homeCurrency
                        ) ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleConvertOpen(entry)}
                            disabled={convertSaving}
                          >
                            Convert to {homeCurrency}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={Boolean(convertTarget)}
        onOpenChange={(open) => {
          if (!open) {
            handleConvertClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Convert to {homeCurrency}</DialogTitle>
            <DialogDescription>
              This updates the linked transaction amount and currency.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConvertSubmit} className="grid gap-4">
            <label className="text-sm text-slate-600">
              Conversion date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="date"
                value={convertDate}
                onChange={(event) => setConvertDate(event.target.value)}
                required
              />
            </label>
            {convertError ? (
              <p className="text-sm text-rose-600">{convertError}</p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleConvertClose}
                  disabled={convertSaving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={convertSaving}>
                Convert
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

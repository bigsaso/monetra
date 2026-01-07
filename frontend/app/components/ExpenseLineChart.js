"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const RESOLUTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

const pad = (value) => String(value).padStart(2, "0");

const parseDate = (value) => new Date(`${value}T00:00:00`);

const getBucketStart = (date, resolution) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (resolution === "weekly") {
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
  }
  if (resolution === "monthly") {
    start.setDate(1);
  }
  if (resolution === "yearly") {
    start.setMonth(0, 1);
  }
  return start;
};

const formatBucketKey = (date, resolution) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  if (resolution === "yearly") return `${year}`;
  if (resolution === "monthly") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
};

const formatBucketLabel = (date, resolution) => {
  if (resolution === "yearly") return `${date.getFullYear()}`;
  if (resolution === "monthly") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
  }
  if (resolution === "weekly") {
    return `Week of ${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
};

const addInterval = (date, resolution) => {
  const next = new Date(date.getTime());
  if (resolution === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  if (resolution === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  if (resolution === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }
  next.setDate(next.getDate() + 1);
  return next;
};

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

export default function ExpenseLineChart({
  account_id = "",
  account_name = ""
}) {
  const [accounts, setAccounts] = useState([]);
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState("daily");
  const [selectedAccountId, setSelectedAccountId] = useState(
    normalizeId(account_id)
  );

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setListLoading(true);
      setError("");
      try {
        const accountsResponse = await fetch("/api/accounts");
        if (!accountsResponse.ok) {
          const data = await accountsResponse.json();
          throw new Error(data?.detail || "Failed to load accounts.");
        }
        const accountsData = await accountsResponse.json();
        if (!isMounted) return;
        setAccounts(accountsData);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) setListLoading(false);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId("");
      return;
    }
    setSelectedAccountId((current) => {
      const normalizedAccounts = accounts.map((account) =>
        normalizeId(account.id)
      );
      if (current && normalizedAccounts.includes(current)) {
        return current;
      }
      const normalizedPropId = normalizeId(account_id);
      if (normalizedPropId && normalizedAccounts.includes(normalizedPropId)) {
        return normalizedPropId;
      }
      return normalizeId(accounts[0].id);
    });
  }, [account_id, accounts]);

  const selectedAccount = useMemo(
    () =>
      accounts.find(
        (account) => normalizeId(account.id) === selectedAccountId
      ) || null,
    [accounts, selectedAccountId]
  );

  const selectedAccountName = selectedAccount?.name || account_name;
  const title = selectedAccountName
    ? `${selectedAccountName} expenses`
    : "Expenses";
  const subtitle = selectedAccountName
    ? `Spend trend for ${selectedAccountName}-linked transactions.`
    : "Select an account to view expense trends.";

  const accountIds = useMemo(() => {
    return new Set(selectedAccountId ? [selectedAccountId] : []);
  }, [selectedAccountId]);

  const { series } = useMemo(() => {
    if (!accountIds.size) {
      return { series: [] };
    }
    const expenseTransactions = accountTransactions.filter(
      (transaction) =>
        transaction.type === "expense" &&
        accountIds.has(normalizeId(transaction.account_id))
    );
    if (!expenseTransactions.length) {
      return { series: [] };
    }

    const totals = new Map();
    let minDate = null;
    let maxDate = null;

    expenseTransactions.forEach((transaction) => {
      const date = parseDate(transaction.date);
      const bucketStart = getBucketStart(date, resolution);
      const key = formatBucketKey(bucketStart, resolution);
      const existing = totals.get(key) || {
        date: bucketStart,
        total: 0
      };
      existing.total += Number(transaction.amount || 0);
      totals.set(key, existing);
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    });

    if (!minDate || !maxDate) {
      return { series: [] };
    }

    const seriesData = [];
    let cursor = getBucketStart(minDate, resolution);
    const end = getBucketStart(maxDate, resolution);
    while (cursor.getTime() <= end.getTime()) {
      const key = formatBucketKey(cursor, resolution);
      const entry = totals.get(key);
      seriesData.push({
        label: formatBucketLabel(cursor, resolution),
        total: entry ? entry.total : 0
      });
      cursor = addInterval(cursor, resolution);
    }

    return { series: seriesData };
  }, [accountIds, resolution, accountTransactions]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedAccountId) {
      setAccountTransactions([]);
      setChartLoading(false);
      return () => {
        isMounted = false;
      };
    }
    const loadAccountTransactions = async () => {
      setChartLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/transactions?account_id=${selectedAccountId}`
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.detail || "Failed to load transactions.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setAccountTransactions(data);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) setChartLoading(false);
      }
    };
    loadAccountTransactions();
    return () => {
      isMounted = false;
    };
  }, [selectedAccountId]);

  const pointCount = series.length;

  const labelInterval = pointCount > 10 ? Math.ceil(pointCount / 6) : 1;
  const tickInterval = Math.max(labelInterval - 1, 0);

  const emptyMessage = !accounts.length
    ? "No accounts yet."
    : "No expense activity yet.";

  const selectClass =
    "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  return (
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-full lg:w-72">
            <div className="grid gap-4">
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Account
                <select
                  className={selectClass}
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  disabled={!accounts.length}
                >
                  {accounts.length === 0 ? (
                    <option value="">No accounts</option>
                  ) : (
                    accounts.map((account) => (
                      <option key={account.id} value={normalizeId(account.id)}>
                        {account.name || "Unnamed account"}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Resolution
                <select
                  className={selectClass}
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                >
                  {RESOLUTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex min-h-[260px] flex-1 items-center">
            {listLoading || chartLoading ? (
              <p>Loading transactions...</p>
            ) : null}
            {error ? <p className="text-rose-600">{error}</p> : null}
            {!listLoading && !chartLoading && !error && series.length === 0 ? (
              <p className="text-sm text-slate-500">{emptyMessage}</p>
            ) : null}

            {!listLoading && !chartLoading && !error && series.length > 0 ? (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={series}
                    margin={{ top: 20, right: 24, bottom: 36, left: 8 }}
                  >
                    <CartesianGrid stroke="rgba(34, 37, 43, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={tickInterval}
                      tick={{ fontSize: 10, fill: "#6b6f78" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value) => currencyFormatter.format(value)}
                      width={72}
                      domain={[0, "dataMax"]}
                      tick={{ fontSize: 11, fill: "#6b6f78" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const value = payload[0]?.value ?? 0;
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            <p className="mb-1 text-xs font-semibold text-slate-900">
                              {label}
                            </p>
                            <p>{currencyFormatter.format(value)}</p>
                          </div>
                        );
                      }}
                      cursor={{ stroke: "rgba(46, 47, 51, 0.2)" }}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#2e2f33"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#2e2f33" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

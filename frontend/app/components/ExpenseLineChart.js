"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { getConversionNote, getCurrencyFormatter } from "../../lib/currency";

const RESOLUTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

const TIMEFRAMES = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "YTD", label: "YTD" },
  { value: "1Y", label: "1Y" },
  { value: "2Y", label: "2Y" },
  { value: "5Y", label: "5Y" }
];

const parseDate = (value) => new Date(`${value}T00:00:00`);

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

const getAverageLabel = (resolution) =>
  ({
    daily: "Avg/day",
    weekly: "Avg/week",
    monthly: "Avg/month",
    yearly: "Avg/year"
  }[resolution] || "Avg/period");

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const STORAGE_KEY = "expenseLineChart.defaultAccountId";

const readStoredAccountId = () => {
  if (typeof window === "undefined") return "";
  try {
    return normalizeId(window.localStorage.getItem(STORAGE_KEY) || "");
  } catch {
    return "";
  }
};

const writeStoredAccountId = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors.
  }
};

export default function ExpenseLineChart({
  account_id = "",
  account_name = "",
  className = "lg:col-span-12",
  homeCurrency = "USD"
}) {
  const [accounts, setAccounts] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportBuckets, setReportBuckets] = useState([]);
  const [resolution, setResolution] = useState("daily");
  const [timeframe, setTimeframe] = useState("1Y");
  const [selectedAccountId, setSelectedAccountId] = useState(
    normalizeId(account_id)
  );
  const currencyFormatter = useMemo(
    () => getCurrencyFormatter(homeCurrency, { maximumFractionDigits: 0 }),
    [homeCurrency]
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
      const storedId = readStoredAccountId();
      if (storedId && normalizedAccounts.includes(storedId)) {
        return storedId;
      }
      const normalizedPropId = normalizeId(account_id);
      if (normalizedPropId && normalizedAccounts.includes(normalizedPropId)) {
        return normalizedPropId;
      }
      return normalizeId(accounts[0].id);
    });
  }, [account_id, accounts]);

  useEffect(() => {
    writeStoredAccountId(selectedAccountId);
  }, [selectedAccountId]);

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

  const averageLabel = getAverageLabel(resolution);

  const { series } = useMemo(() => {
    if (!reportBuckets.length) {
      return { series: [] };
    }
    const amountTotal = reportBuckets.reduce(
      (sum, bucket) => sum + Number(bucket.total || 0),
      0
    );
    const averagePerBucket = reportBuckets.length
      ? amountTotal / reportBuckets.length
      : 0;
    const seriesData = reportBuckets.map((bucket) => ({
      label: formatBucketLabel(parseDate(bucket.bucket_start), resolution),
      total: Number(bucket.total || 0),
      average: averagePerBucket,
      sourceCurrencies: bucket.source_currencies || []
    }));
    return { series: seriesData };
  }, [reportBuckets, resolution]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedAccountId) {
      setReportBuckets([]);
      setChartLoading(false);
      return () => {
        isMounted = false;
      };
    }
    const loadExpenseTrends = async () => {
      setChartLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams({
          account_id: selectedAccountId,
          resolution,
          timeframe
        });
        const response = await fetch(
          `/api/reports/expense-trends?${searchParams.toString()}`
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.detail || "Failed to load expense trends.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setReportBuckets(data?.buckets || []);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) setChartLoading(false);
      }
    };
    loadExpenseTrends();
    return () => {
      isMounted = false;
    };
  }, [resolution, selectedAccountId, timeframe]);

  const pointCount = series.length;

  const labelInterval = pointCount > 10 ? Math.ceil(pointCount / 6) : 1;
  const tickInterval = Math.max(labelInterval - 1, 0);

  const emptyMessage = !accounts.length
    ? "No accounts yet."
    : "No expense activity yet.";

  const selectClass =
    "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  return (
    <Card className={className}>
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
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Timeframe
                <select
                  className={selectClass}
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value)}
                >
                  {TIMEFRAMES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex min-h-[220px] flex-1 items-center sm:min-h-[260px]">
            {listLoading || chartLoading ? (
              <p>Loading expense trends...</p>
            ) : null}
            {error ? <p className="text-rose-600">{error}</p> : null}
            {!listLoading && !chartLoading && !error && series.length === 0 ? (
              <p className="text-sm text-slate-500">{emptyMessage}</p>
            ) : null}

            {!listLoading && !chartLoading && !error && series.length > 0 ? (
              <div className="h-[240px] w-full sm:h-[320px]">
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
                        const totalEntry = payload.find(
                          (item) => item.dataKey === "total"
                        );
                        const averageEntry = payload.find(
                          (item) => item.dataKey === "average"
                        );
                        const totalValue = totalEntry?.value ?? 0;
                        const averageValue = averageEntry?.value ?? 0;
                        const conversionNote = getConversionNote(
                          payload[0]?.payload?.sourceCurrencies,
                          homeCurrency
                        );
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            <p className="mb-1 text-xs font-semibold text-slate-900">
                              {label}
                            </p>
                            <p>{currencyFormatter.format(totalValue)}</p>
                            <p className="text-slate-500">
                              {averageLabel}: {currencyFormatter.format(averageValue)}
                            </p>
                            {conversionNote ? (
                              <p className="text-slate-500">{conversionNote}</p>
                            ) : null}
                          </div>
                        );
                      }}
                      cursor={{ stroke: "rgba(46, 47, 51, 0.2)" }}
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Legend verticalAlign="top" align="right" height={24} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke="#2e2f33"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: "#2e2f33" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="average"
                      name={averageLabel}
                      stroke="#8a8f98"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      dot={false}
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

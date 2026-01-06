"use client";

import { useEffect, useMemo, useState } from "react";

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

  const { series, maxValue } = useMemo(() => {
    if (!accountIds.size) {
      return { series: [], maxValue: 0 };
    }
    const expenseTransactions = accountTransactions.filter(
      (transaction) =>
        transaction.type === "expense" &&
        accountIds.has(normalizeId(transaction.account_id))
    );
    if (!expenseTransactions.length) {
      return { series: [], maxValue: 0 };
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
      return { series: [], maxValue: 0 };
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

    const max = Math.max(...seriesData.map((item) => item.total), 0);
    return { series: seriesData, maxValue: max };
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

  const width = 960;
  const height = 360;
  const padding = { top: 20, right: 24, bottom: 44, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const scaleY = (value) => {
    const range = maxValue || 1;
    return padding.top + (1 - value / range) * chartHeight;
  };

  const pointCount = series.length;
  const scaleX = (index) => {
    if (pointCount <= 1) {
      return padding.left + chartWidth / 2;
    }
    return padding.left + (chartWidth * index) / (pointCount - 1);
  };

  const labelInterval = pointCount > 10 ? Math.ceil(pointCount / 6) : 1;
  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => {
    return maxValue - (maxValue * index) / tickCount;
  });

  const linePoints = series
    .map((item, index) => `${scaleX(index)},${scaleY(item.total)}`)
    .join(" ");

  const emptyMessage = !accounts.length
    ? "No accounts yet."
    : "No expense activity yet.";

  return (
    <section className="card">
      <div className="chart-layout">
        <div className="chart-meta">
          <div className="card-header chart-header">
            <div>
              <h2>{title}</h2>
              <p className="subtle">{subtitle}</p>
            </div>
          </div>
          <div className="selectors">
            <label className="selector">
              <span className="selector-label">Account</span>
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                disabled={!accounts.length}
              >
                {accounts.length === 0 ? (
                  <option value="">No accounts</option>
                ) : (
                  accounts.map((account) => (
                    <option
                      key={account.id}
                      value={normalizeId(account.id)}
                    >
                      {account.name || "Unnamed account"}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="selector">
              <span className="selector-label">Resolution</span>
              <select
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

        <div className="chart-area">
          {listLoading || chartLoading ? (
            <p>Loading transactions...</p>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          {!listLoading && !chartLoading && !error && series.length === 0 ? (
            <p className="chart-empty">{emptyMessage}</p>
          ) : null}

          {!listLoading && !chartLoading && !error && series.length > 0 ? (
            <div className="chart">
              <svg viewBox={`0 0 ${width} ${height}`} role="img">
            <g>
              {tickValues.map((value) => {
                const y = scaleY(value);
                return (
                  <g key={`grid-${value}`}>
                    <line
                      x1={padding.left}
                      x2={width - padding.right}
                      y1={y}
                      y2={y}
                      className="grid-line"
                    />
                    <text x={padding.left - 12} y={y + 4} className="tick">
                      {currencyFormatter.format(value)}
                    </text>
                  </g>
                );
              })}
            </g>

            <polyline
              fill="none"
              className="line"
              points={linePoints}
            />

            {series.map((item, index) => (
              <circle
                key={`point-${item.label}`}
                cx={scaleX(index)}
                cy={scaleY(item.total)}
                r="3"
                className="point"
              />
            ))}

            {series.map((item, index) =>
              index % labelInterval === 0 ? (
                <text
                  key={`label-${item.label}`}
                  x={scaleX(index)}
                  y={height - padding.bottom + 22}
                  textAnchor="middle"
                  className="label"
                >
                  {item.label}
                </text>
              ) : null
            )}
              </svg>
            </div>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .chart-layout {
          display: flex;
          gap: 24px;
          align-items: stretch;
        }

        .chart-meta {
          flex: 0 0 280px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .chart-area {
          flex: 1;
          min-width: 320px;
          display: flex;
          align-items: center;
        }

        .chart {
          width: 100%;
        }

        svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .selectors {
          display: flex;
          gap: 12px;
          flex-direction: column;
        }

        .selector {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12px;
          color: #6b6f78;
        }

        .selector select {
          border: 1px solid rgba(34, 37, 43, 0.2);
          border-radius: 12px;
          padding: 6px 10px;
          font-size: 13px;
          background: #fff;
          color: #2e2f33;
        }

        .selector-label {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-size: 10px;
          color: #7b808a;
        }

        .grid-line {
          stroke: rgba(34, 37, 43, 0.08);
          stroke-width: 1;
        }

        .tick {
          font-size: 11px;
          fill: #6b6f78;
          text-anchor: end;
        }

        .label {
          font-size: 10px;
          fill: #6b6f78;
        }

        .line {
          stroke: #2e2f33;
          stroke-width: 2;
        }

        .point {
          fill: #2e2f33;
        }

        .chart-empty {
          margin: 0;
          color: #666a73;
        }

        @media (max-width: 900px) {
          .chart-layout {
            flex-direction: column;
          }

          .chart-meta {
            flex: 1 1 auto;
          }

          .selectors {
            flex-direction: row;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </section>
  );
}

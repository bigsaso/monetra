"use client";

import { useMemo, useState } from "react";

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

const matchesCardLabel = (account, label) => {
  if (!label) return false;
  const normalized = label.toLowerCase();
  const accountText = `${account.name || ""} ${
    account.institution || ""
  }`.toLowerCase();
  return accountText.includes(normalized);
};

export default function ExpenseLineChart({
  title,
  subtitle,
  cardLabel,
  accounts = [],
  transactions = [],
  loading = false,
  error = ""
}) {
  const [resolution, setResolution] = useState("daily");

  const matchingAccounts = useMemo(
    () => accounts.filter((account) => matchesCardLabel(account, cardLabel)),
    [accounts, cardLabel]
  );

  const accountIds = useMemo(
    () => new Set(matchingAccounts.map((account) => account.id)),
    [matchingAccounts]
  );

  const { series, maxValue } = useMemo(() => {
    if (!accountIds.size) {
      return { series: [], maxValue: 0 };
    }
    const expenseTransactions = transactions.filter(
      (transaction) =>
        transaction.type === "expense" && accountIds.has(transaction.account_id)
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
  }, [accountIds, resolution, transactions]);

  const width = 720;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 56, left: 64 };
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

  const emptyMessage = !matchingAccounts.length
    ? `No ${cardLabel} account found.`
    : "No expense activity yet.";

  return (
    <section className="card">
      <div className="card-header chart-header">
        <div>
          <h2>{title}</h2>
          <p className="subtle">{subtitle}</p>
        </div>
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

      {loading ? <p>Loading transactions...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && !error && series.length === 0 ? (
        <p className="chart-empty">{emptyMessage}</p>
      ) : null}

      {!loading && !error && series.length > 0 ? (
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
                  y={height - padding.bottom + 24}
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

      <style jsx>{`
        .chart {
          width: 100%;
        }

        svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
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
      `}</style>
    </section>
  );
}

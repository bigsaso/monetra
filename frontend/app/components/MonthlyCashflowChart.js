"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatAmount = (value) => currencyFormatter.format(value);

const formatMonthLabel = (value) => value || "-";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload.reduce((acc, entry) => {
    acc[entry.dataKey] = entry.value;
    return acc;
  }, {});

  return (
    <div className="tooltip">
      <p className="tooltip-title">{formatMonthLabel(label)}</p>
      <p>Income: {formatAmount(data.income || 0)}</p>
      <p>Expenses: {formatAmount(data.expenses || 0)}</p>
      <p>Net: {formatAmount(data.net || 0)}</p>
    </div>
  );
};

export default function MonthlyCashflowChart({ data }) {
  const chartData = useMemo(
    () =>
      (data || []).map((item) => {
        const income = Number(item.total_income || 0);
        const expenses = Number(item.total_expenses || 0);
        const net = Number(item.net_cashflow || 0);
        return {
          month: item.month,
          income,
          expenses,
          net
        };
      }),
    [data]
  );

  if (!chartData.length) {
    return <p className="chart-empty">No monthly cashflow data yet.</p>;
  }

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 24, bottom: 36, left: 8 }}
        >
          <CartesianGrid stroke="rgba(34, 37, 43, 0.08)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tick={{ fontSize: 11, fill: "#6b6f78" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatAmount}
            width={72}
            tick={{ fontSize: 11, fill: "#6b6f78" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(46, 47, 51, 0.04)" }}
            wrapperStyle={{ outline: "none" }}
          />
          <ReferenceLine
            y={0}
            stroke="rgba(34, 37, 43, 0.2)"
            strokeWidth={1.2}
          />
          <Bar
            dataKey="income"
            fill="#1f7a4d"
            radius={[4, 4, 0, 0]}
            barSize={18}
          />
          <Bar
            dataKey="expenses"
            fill="#b23a3a"
            radius={[4, 4, 0, 0]}
            barSize={18}
          />
          <Line
            type="monotone"
            dataKey="net"
            stroke="#2e2f33"
            strokeWidth={2}
            dot={{ r: 3, fill: "#2e2f33" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch income" /> Income
        </span>
        <span className="legend-item">
          <span className="legend-swatch expense" /> Expenses
        </span>
        <span className="legend-item">
          <span className="legend-swatch net" /> Net cashflow
        </span>
      </div>

      <style jsx>{`
        .chart {
          position: relative;
          width: 100%;
        }

        .tooltip {
          position: absolute;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(34, 37, 43, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          color: #2d3138;
          box-shadow: 0 10px 20px rgba(20, 24, 36, 0.12);
          min-width: 160px;
        }

        .tooltip-title {
          margin: 0 0 6px;
          font-weight: 600;
          color: #2e2f33;
        }

        .tooltip p {
          margin: 0;
          line-height: 1.4;
        }

        .legend {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-size: 12px;
          color: #6b6f78;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #1f7a4d;
        }

        .legend-swatch.expense {
          background: #b23a3a;
        }

        .legend-swatch.net {
          background: #2e2f33;
        }

        .chart-empty {
          margin: 0;
          color: #666a73;
        }

        :global(.recharts-cartesian-axis-tick text) {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}

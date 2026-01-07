"use client";

import { useMemo } from "react";
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatAmount = (value) => currencyFormatter.format(value);

const formatPercentage = (value) => `${value.toFixed(1)}%`;

const palette = [
  "#1f7a4d",
  "#b23a3a",
  "#2f6f9e",
  "#c4841a",
  "#0f8b8d",
  "#5f6b7a",
  "#7a9e7e",
  "#d1495b"
];

export default function CategoryBreakdownChart({ data }) {
  const chartData = useMemo(
    () =>
      (data || []).map((item, index) => ({
        category: item.category || "Uncategorized",
        totalSpent: Number(item.total_spent || 0),
        percentage: Number(item.percentage_of_total || 0),
        color: palette[index % palette.length]
      })),
    [data]
  );

  const totalSpent = useMemo(
    () => chartData.reduce((sum, item) => sum + item.totalSpent, 0),
    [chartData]
  );

  const renderCenterLabel = ({ viewBox }) => {
    const { cx, cy } = viewBox;
    return (
      <>
        <text x={cx} y={cy - 4} textAnchor="middle" className="total-label">
          Total
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="total-value">
          {formatAmount(totalSpent)}
        </text>
      </>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <div className="tooltip">
        <p className="tooltip-title">{data.category}</p>
        <p>{formatAmount(data.totalSpent)}</p>
      </div>
    );
  };

  if (!chartData.length || totalSpent <= 0) {
    return <p className="chart-empty">No expense data yet.</p>;
  }

  return (
    <div className="breakdown">
      <div className="chart-row">
        <div className="donut" role="img" aria-label="Expense breakdown">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="totalSpent"
                nameKey="category"
                innerRadius={70}
                outerRadius={96}
                paddingAngle={2}
                stroke="none"
                labelLine={false}
              >
                <Label content={renderCenterLabel} position="center" />
                {chartData.map((entry, index) => (
                  <Cell key={`${entry.category}-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="legend">
          {chartData.map((item, index) => (
            <div
              key={`${item.category}-${index}`}
              className="legend-row"
              tabIndex={0}
              role="button"
            >
              <span className="swatch" style={{ background: item.color }} />
              <span className="label">{item.category}</span>
              <span className="percent">{formatPercentage(item.percentage)}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .breakdown {
          position: relative;
        }

        .chart-row {
          display: grid;
          grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
          gap: 24px;
          align-items: center;
        }

        .donut {
          width: 100%;
          min-width: 220px;
        }

        .total-label {
          font-size: 12px;
          fill: #6b6f78;
        }

        .total-value {
          font-size: 16px;
          font-weight: 600;
          fill: #2e2f33;
        }

        .legend {
          display: grid;
          gap: 12px;
        }

        .legend-row {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #2d3138;
          outline: none;
        }

        .swatch {
          width: 12px;
          height: 12px;
          border-radius: 999px;
        }

        .label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .percent {
          font-variant-numeric: tabular-nums;
          color: #6b6f78;
        }

        .tooltip {
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(34, 37, 43, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          color: #2d3138;
          box-shadow: 0 10px 20px rgba(20, 24, 36, 0.12);
          min-width: 140px;
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

        .chart-empty {
          margin: 0;
          color: #666a73;
        }

        @media (max-width: 700px) {
          .chart-row {
            grid-template-columns: 1fr;
          }
        }

        :global(.recharts-tooltip-wrapper) {
          outline: none;
        }
      `}</style>
    </div>
  );
}

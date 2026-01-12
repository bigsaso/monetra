"use client";

import { useMemo, useRef, useState } from "react";
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
  const legendContainerRef = useRef(null);
  const [legendTooltip, setLegendTooltip] = useState(null);
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
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-500 text-xs">
          Total
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          className="fill-slate-900 text-sm font-semibold"
        >
          {formatAmount(totalSpent)}
        </text>
      </>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const chartEntry = payload[0]?.payload;
    if (!chartEntry) return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
        <p className="mb-1 text-xs font-semibold text-slate-900">
          {chartEntry.category}
        </p>
        <p>{formatAmount(chartEntry.totalSpent)}</p>
        <p className="text-slate-500">
          {formatPercentage(chartEntry.percentage)}
        </p>
      </div>
    );
  };

  if (!chartData.length || totalSpent <= 0) {
    return <p className="text-sm text-slate-500">No expense data yet.</p>;
  }

  const handleLegendEnter = (item, event) => {
    if (!legendContainerRef.current) return;
    const containerRect = legendContainerRef.current.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();

    setLegendTooltip({
      item,
      top: targetRect.top - containerRect.top + targetRect.height / 2,
      left: targetRect.right - containerRect.left + 12
    });
  };

  const handleLegendLeave = () => {
    setLegendTooltip(null);
  };

  return (
    <div className="space-y-4">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <div
          className="h-[200px] w-full min-w-[220px] sm:h-[240px]"
          role="img"
          aria-label="Expense breakdown"
        >
          <ResponsiveContainer width="100%" height="100%">
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

        <div className="relative" ref={legendContainerRef}>
          {legendTooltip ? (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg"
              style={{
                top: legendTooltip.top,
                left: legendTooltip.left,
                transform: "translateY(-50%)"
              }}
            >
              <p className="mb-1 text-xs font-semibold text-slate-900">
                {legendTooltip.item.category}
              </p>
              <p>{formatAmount(legendTooltip.item.totalSpent)}</p>
              <p className="text-slate-500">
                {formatPercentage(legendTooltip.item.percentage)}
              </p>
            </div>
          ) : null}
          <div className="grid gap-3">
            {chartData.map((item, index) => (
              <div
                key={`${item.category}-${index}`}
                className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-3 text-sm text-slate-700"
                tabIndex={0}
                role="button"
                onMouseEnter={(event) => handleLegendEnter(item, event)}
                onMouseLeave={handleLegendLeave}
                onFocus={(event) => handleLegendEnter(item, event)}
                onBlur={handleLegendLeave}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="truncate">{item.category}</span>
                <span className="text-xs text-slate-500">
                  {formatPercentage(item.percentage)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

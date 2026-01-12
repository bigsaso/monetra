"use client";

import { useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "./ui/card";
import { Button } from "./ui/button";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const formatMonthValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const formatMonthLabel = (value) => {
  if (!value) return "";
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const shiftMonth = (value, delta) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setMonth(parsed.getMonth() + delta);
  return formatMonthValue(parsed);
};

const palette = {
  needs: "hsl(var(--chart-needs))",
  wants: "hsl(var(--chart-wants))",
  investments: "hsl(var(--chart-investments))",
  savings: "hsl(var(--chart-savings))",
  overbudget: "hsl(var(--chart-overbudget))"
};

const formatAmount = (value) => currencyFormatter.format(value);

const formatPercentage = (value) => `${value.toFixed(1)}%`;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const chartEntry = payload[0]?.payload;
  if (!chartEntry) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-slate-900">
        {chartEntry.label}
      </p>
      <p>{formatAmount(chartEntry.value)}</p>
      <p className="text-slate-500">{formatPercentage(chartEntry.percentage)}</p>
    </div>
  );
};

export default function ExpenseGroupPieChart({
  data,
  month,
  onMonthChange,
  title = "Expense groups",
  description = "Monthly needs, wants, investments, and savings.",
  loading = false,
  error = "",
  className = "",
  showMonthControls = true
}) {
  const legendContainerRef = useRef(null);
  const [legendTooltip, setLegendTooltip] = useState(null);
  const resolvedMonth = useMemo(
    () => month || formatMonthValue(new Date()),
    [month]
  );

  const chartData = useMemo(() => {
    // TODO: Merge projected totals once forecast data is available.
    const incomeTotal = Number(data?.income_total || 0);
    const needs = Number(data?.needs_total || 0);
    const wants = Number(data?.wants_total || 0);
    const investments = Number(data?.investments_total || 0);
    const expensesTotal = needs + wants + investments;
    const savings = incomeTotal - expensesTotal;
    const savingsValue = Math.max(0, savings);
    const overbudgetValue = Math.max(0, -savings);

    const groups = [
      {
        key: "needs",
        label: "Needs",
        value: needs,
        color: palette.needs
      },
      {
        key: "wants",
        label: "Wants",
        value: wants,
        color: palette.wants
      },
      {
        key: "investments",
        label: "Investments",
        value: investments,
        color: palette.investments
      }
    ];

    if (savingsValue > 0) {
      groups.push({
        key: "savings",
        label: "Savings",
        value: savingsValue,
        color: palette.savings
      });
    } else if (overbudgetValue > 0) {
      groups.push({
        key: "overbudget",
        label: "Overbudget",
        value: overbudgetValue,
        color: palette.overbudget
      });
    }

    const total = groups.reduce((sum, item) => sum + item.value, 0);
    const groupsWithPercentages = groups.map((item) => ({
      ...item,
      percentage: total ? (item.value / total) * 100 : 0
    }));

    return {
      total,
      incomeTotal,
      expensesTotal,
      savings,
      groups: groupsWithPercentages
    };
  }, [data]);

  const handlePreviousMonth = () => {
    if (!onMonthChange) return;
    onMonthChange(shiftMonth(resolvedMonth, -1));
  };

  const handleNextMonth = () => {
    if (!onMonthChange) return;
    onMonthChange(shiftMonth(resolvedMonth, 1));
  };

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
    <Card className={className}>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {showMonthControls ? (
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviousMonth}
              disabled={!onMonthChange}
            >
              Prev
            </Button>
            <span className="min-w-[120px] text-center text-sm font-medium text-slate-700 sm:min-w-[140px]">
              {formatMonthLabel(resolvedMonth)}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={handleNextMonth}
              disabled={!onMonthChange}
            >
              Next
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-slate-500">Loading expense breakdown...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : chartData.total <= 0 ? (
          <p className="text-sm text-slate-500">
            No income or expense data yet.
          </p>
        ) : (
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <div
              className="h-[200px] w-full min-w-[220px] sm:h-[240px]"
              role="img"
              aria-label={title}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.groups}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={70}
                    outerRadius={96}
                    paddingAngle={2}
                    stroke="none"
                    labelLine={false}
                    isAnimationActive={false}
                  >
                    {chartData.groups.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
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
                    {legendTooltip.item.label}
                  </p>
                  <p>{formatAmount(legendTooltip.item.value)}</p>
                  <p className="text-slate-500">
                    {formatPercentage(legendTooltip.item.percentage)}
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3">
                {chartData.groups.map((item) => (
                  <div
                    key={item.key}
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
                    <span className="truncate">{item.label}</span>
                    <span className="text-xs text-slate-500">
                      {formatAmount(item.value)} ·{" "}
                      {formatPercentage(item.percentage)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

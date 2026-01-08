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

const toMonthKey = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload || {};
  const hasProjected =
    Number(data.projectedIncome || 0) > 0 || Number(data.projectedExpenses || 0) > 0;
  const projectedNet =
    Number(data.projectedIncome || 0) - Number(data.projectedExpenses || 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-slate-900">
        {formatMonthLabel(label)}
      </p>
      <p>Actual income: {formatAmount(data.income || 0)}</p>
      <p>Actual expenses: {formatAmount(data.expenses || 0)}</p>
      <p>Actual net: {formatAmount(data.net || 0)}</p>
      {hasProjected ? (
        <p>Projected income: {formatAmount(data.projectedIncome || 0)}</p>
      ) : null}
      {hasProjected ? (
        <p>Projected expenses: {formatAmount(data.projectedExpenses || 0)}</p>
      ) : null}
      {hasProjected ? <p>Projected net: {formatAmount(projectedNet)}</p> : null}
    </div>
  );
};

export default function MonthlyCashflowChart({ data }) {
  const chartData = useMemo(
    () => {
      const today = new Date();
      const currentMonthKey = toMonthKey(today);
      const nextMonthKey = toMonthKey(
        new Date(today.getFullYear(), today.getMonth() + 1, 1)
      );

      return (data || []).map((item) => {
        const income = Number(item.total_income || 0);
        const expenses = Number(item.total_expenses || 0);
        const net = Number(item.net_cashflow || 0);
        const projectedIncomeCurrentRaw =
          item.month === currentMonthKey
            ? Number(item.projected_total_income_current_month || 0)
            : 0;
        const projectedExpensesCurrentRaw =
          item.month === currentMonthKey
            ? Number(item.projected_total_expenses_current_month || 0)
            : 0;
        const projectedIncomeNext =
          item.month === nextMonthKey
            ? Number(item.projected_total_income || 0)
            : 0;
        const projectedExpensesNext =
          item.month === nextMonthKey
            ? Number(item.projected_total_expenses || 0)
            : 0;
        const projectedIncomeTotal =
          item.month === currentMonthKey
            ? projectedIncomeCurrentRaw
            : projectedIncomeNext;
        const projectedExpensesTotal =
          item.month === currentMonthKey
            ? projectedExpensesCurrentRaw
            : projectedExpensesNext;

        return {
          month: item.month,
          income,
          expenses,
          net,
          incomeProjectedRemainder: Math.max(projectedIncomeTotal - income, 0),
          expensesProjectedRemainder: Math.max(projectedExpensesTotal - expenses, 0),
          projectedIncome: projectedIncomeTotal,
          projectedExpenses: projectedExpensesTotal
        };
      });
    },
    [data]
  );

  if (!chartData.length) {
    return <p className="text-sm text-slate-500">No monthly cashflow data yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
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
            <ReferenceLine y={0} stroke="rgba(34, 37, 43, 0.2)" strokeWidth={1.2} />
            <Bar
              dataKey="income"
              fill="#1f7a4d"
              radius={[4, 4, 0, 0]}
              barSize={18}
              stackId="income"
            />
            <Bar
              dataKey="incomeProjectedRemainder"
              fill="rgba(31, 122, 77, 0.35)"
              radius={[4, 4, 0, 0]}
              barSize={18}
              stackId="income"
            />
            <Bar
              dataKey="expenses"
              fill="#b23a3a"
              radius={[4, 4, 0, 0]}
              barSize={18}
              stackId="expenses"
            />
            <Bar
              dataKey="expensesProjectedRemainder"
              fill="rgba(178, 58, 58, 0.35)"
              radius={[4, 4, 0, 0]}
              barSize={18}
              stackId="expenses"
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
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          Income
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
          Expenses
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
          Net cashflow
        </span>
      </div>
    </div>
  );
}

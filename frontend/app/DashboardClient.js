"use client";

import { useEffect, useMemo, useState } from "react";
import ExpenseLineChart from "./components/ExpenseLineChart";
import MonthlyExpenseSummaryCard from "./components/MonthlyExpenseSummaryCard";
import MonthlyCashflowChart from "./components/MonthlyCashflowChart";
import SpendingByCategoryLineChartCard from "./components/SpendingByCategoryLineChartCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { useCategoryBreakdown } from "../lib/useCategoryBreakdown";
import { useMonthlyExpenseGroups } from "../lib/useMonthlyExpenseGroups";
import { useMonthlyTrends } from "../lib/useMonthlyTrends";
import { useNetFlowSummary } from "../lib/useNetFlowSummary";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const statusBadgeClasses = {
  success: "border-emerald-200 bg-emerald-100 text-emerald-700",
  warning: "border-amber-200 bg-amber-100 text-amber-700",
  danger: "border-rose-200 bg-rose-100 text-rose-700"
};

const progressFillClasses = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500"
};

const formatMonthValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const formatMonthLabel = (value) => {
  if (!value) return "";
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatDateValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const shiftMonth = (value, delta) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setMonth(parsed.getMonth() + delta);
  return formatMonthValue(parsed);
};

const getMonthDateRange = (value) => {
  const parsed = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { startDate: undefined, endDate: undefined };
  }
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  const end = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  return { startDate: formatDateValue(start), endDate: formatDateValue(end) };
};

export default function DashboardClient() {
  const [accounts, setAccounts] = useState([]);
  const [budgetEvaluations, setBudgetEvaluations] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState("");
  const [expenseSummaryMonth, setExpenseSummaryMonth] = useState(() =>
    formatMonthValue(new Date())
  );
  const nextMonthEndDate = useMemo(() => {
    const today = new Date();
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(
      nextMonthStart.getFullYear(),
      nextMonthStart.getMonth() + 1,
      0
    );
    return formatDateValue(nextMonthEnd);
  }, []);
  const {
    data: monthlyTrends,
    loading: trendsLoading,
    error: trendsError
  } = useMonthlyTrends({ endDate: nextMonthEndDate });
  const {
    data: expenseSummaryGroups,
    loading: expenseSummaryGroupsLoading,
    error: expenseSummaryGroupsError
  } = useMonthlyExpenseGroups({ month: expenseSummaryMonth });
  const { startDate: summaryStartDate, endDate: summaryEndDate } = useMemo(
    () => getMonthDateRange(expenseSummaryMonth),
    [expenseSummaryMonth]
  );
  const {
    data: expenseSummaryCategoryBreakdown,
    loading: expenseSummaryBreakdownLoading,
    error: expenseSummaryBreakdownError
  } = useCategoryBreakdown({ startDate: summaryStartDate, endDate: summaryEndDate });
  const {
    data: netFlowSummary,
    loading: netFlowLoading
  } = useNetFlowSummary({ month: expenseSummaryMonth });

  const loadData = async () => {
    try {
      const accountsResponse = await fetch("/api/accounts");
      if (!accountsResponse.ok) {
        const data = await accountsResponse.json();
        throw new Error(data?.detail || "Failed to load accounts.");
      }
      const accountsData = await accountsResponse.json();
      setAccounts(accountsData);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const loadBudgetEvaluations = async () => {
    setBudgetLoading(true);
    setBudgetError("");
    try {
      const response = await fetch("/api/budget/evaluate?period=monthly");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load budget rules.");
      }
      const data = await response.json();
      setBudgetEvaluations(data);
    } catch (err) {
      setBudgetError(err.message);
    } finally {
      setBudgetLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadBudgetEvaluations();
  }, []);

  const expenseSummaryNetFlow = useMemo(() => {
    if (!netFlowSummary) return 0;
    return Number(netFlowSummary.net_flow_current_month || 0);
  }, [netFlowSummary]);

  const budgetRuleName = (rule) => {
    const ruleTypeLabels = {
      category_cap: "Category cap",
      account_cap: "Account cap",
      savings_target: "Savings target",
      monthly_cap: "Monthly cap",
      weekly_cap: "Weekly cap",
      one_time: "One-time cap"
    };
    const label = ruleTypeLabels[rule.rule_type] || "Budget rule";
    if (rule.rule_type === "category_cap") {
      return `${label} · ${rule.category || "Unassigned"}`;
    }
    if (rule.rule_type === "account_cap") {
      const accountName =
        accounts.find((account) => account.id === rule.account_id)?.name ||
        "Unassigned";
      return `${label} · ${accountName}`;
    }
    return label;
  };

  const budgetStatus = (rule) => {
    const normalized = String(rule.status || "").toLowerCase();
    if (normalized === "over") {
      return { label: "Exceeded", tone: "danger" };
    }
    if (normalized === "short") {
      return { label: "Warning", tone: "warning" };
    }
    if (normalized === "ok" || normalized === "met") {
      return { label: "On track", tone: "success" };
    }
    const amountValue = Number(rule.amount || 0);
    const currentValue = Number(rule.current_value || 0);
    if (!amountValue) {
      return { label: "On track", tone: "success" };
    }
    const ratio = currentValue / amountValue;
    if (ratio >= 1) {
      return { label: "Exceeded", tone: "danger" };
    }
    if (ratio >= 0.8) {
      return { label: "Warning", tone: "warning" };
    }
    return { label: "On track", tone: "success" };
  };

  const budgetProgress = (rule) => {
    const amountValue = Number(rule.amount || 0);
    const currentValue = Number(rule.current_value || 0);
    if (!amountValue) return 0;
    const ratio = currentValue / amountValue;
    return Math.max(0, Math.min(ratio, 1));
  };

  const handleExpenseSummaryPreviousMonth = () => {
    setExpenseSummaryMonth((prev) => shiftMonth(prev, -1));
  };

  const handleExpenseSummaryNextMonth = () => {
    setExpenseSummaryMonth((prev) => shiftMonth(prev, 1));
  };

  return (
    <div className="min-h-screen px-5 py-12 pb-20 sm:px-8 lg:px-16">
      <main className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <MonthlyExpenseSummaryCard
          className="md:col-span-12"
          month={expenseSummaryMonth}
          monthLabel={formatMonthLabel(expenseSummaryMonth)}
          netFlow={expenseSummaryNetFlow}
          netFlowPercentageChange={netFlowSummary?.percentage_change ?? null}
          netFlowLoading={netFlowLoading}
          onPreviousMonth={handleExpenseSummaryPreviousMonth}
          onNextMonth={handleExpenseSummaryNextMonth}
          expenseGroups={expenseSummaryGroups}
          expenseGroupsLoading={expenseSummaryGroupsLoading}
          expenseGroupsError={expenseSummaryGroupsError}
          categoryBreakdown={expenseSummaryCategoryBreakdown}
          categoryBreakdownLoading={expenseSummaryBreakdownLoading}
          categoryBreakdownError={expenseSummaryBreakdownError}
        />

        <SpendingByCategoryLineChartCard className="md:col-span-6" />

        <Card className="md:col-span-6">
          <CardHeader>
            <CardTitle>Monthly cashflow</CardTitle>
            <CardDescription>Income, expenses, and net cashflow.</CardDescription>
          </CardHeader>
          <CardContent>
            {trendsLoading ? <p>Loading monthly cashflow...</p> : null}
            {trendsError ? <p className="text-rose-600">{trendsError}</p> : null}
            {!trendsLoading && !trendsError ? (
              <MonthlyCashflowChart data={monthlyTrends} />
            ) : null}
          </CardContent>
        </Card>

        <Card className="md:col-span-6">
          <CardHeader>
            <CardTitle>Budget overview</CardTitle>
            <CardDescription>
              Monthly rule status across categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budgetLoading ? <p>Loading budget rules...</p> : null}
            {budgetError ? <p className="text-rose-600">{budgetError}</p> : null}
            {!budgetLoading && budgetEvaluations.length === 0 ? (
              <p>No budget rules to evaluate yet.</p>
            ) : (
              <div className="grid gap-4">
                {budgetEvaluations.map((rule) => {
                  const status = budgetStatus(rule);
                  const progressValue = Math.round(budgetProgress(rule) * 100);
                  return (
                    <article
                      key={rule.rule_id}
                      className="rounded-xl border border-slate-200/70 bg-white/70 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {budgetRuleName(rule)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {currencyFormatter.format(
                              Number(rule.current_value || 0)
                            )}{" "}
                            of {currencyFormatter.format(Number(rule.amount || 0))}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            statusBadgeClasses[status.tone]
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <div
                        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200/70"
                        role="progressbar"
                        aria-valuenow={progressValue}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span
                          className={`block h-full rounded-full ${
                            progressFillClasses[status.tone]
                          }`}
                          style={{ width: `${progressValue}%` }}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <ExpenseLineChart className="md:col-span-6" />
      </main>
    </div>
  );
}

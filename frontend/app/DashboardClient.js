"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CategoryBreakdownChart from "./components/CategoryBreakdownChart";
import ExpenseLineChart from "./components/ExpenseLineChart";
import ExpenseGroupPieChart from "./components/ExpenseGroupPieChart";
import MonthlyCashflowChart from "./components/MonthlyCashflowChart";
import SignOutButton from "./components/SignOutButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { useCategoryBreakdown } from "../lib/useCategoryBreakdown";
import { useMonthlyExpenseGroups } from "../lib/useMonthlyExpenseGroups";
import { useMonthlyTrends } from "../lib/useMonthlyTrends";

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

export default function DashboardClient({ userEmail }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgetEvaluations, setBudgetEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState("");
  const [expenseGroupsMonth, setExpenseGroupsMonth] = useState(null);
  const {
    data: monthlyTrends,
    loading: trendsLoading,
    error: trendsError
  } = useMonthlyTrends();
  const {
    data: expenseGroups,
    loading: expenseGroupsLoading,
    error: expenseGroupsError
  } = useMonthlyExpenseGroups({ month: expenseGroupsMonth });
  const {
    data: categoryBreakdown,
    loading: breakdownLoading,
    error: breakdownError
  } = useCategoryBreakdown();

  const monthLabel = useMemo(
    () =>
      new Date().toLocaleString("en-US", {
        month: "long",
        year: "numeric"
      }),
    []
  );

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [accountsResponse, transactionsResponse] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/transactions")
      ]);
      if (!accountsResponse.ok) {
        const data = await accountsResponse.json();
        throw new Error(data?.detail || "Failed to load accounts.");
      }
      if (!transactionsResponse.ok) {
        const data = await transactionsResponse.json();
        throw new Error(data?.detail || "Failed to load transactions.");
      }
      const accountsData = await accountsResponse.json();
      const transactionsData = await transactionsResponse.json();
      setAccounts(accountsData);
      setTransactions(transactionsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const netFlow = useMemo(() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return transactions.reduce((total, transaction) => {
      const txDate = new Date(`${transaction.date}T00:00:00`);
      if (txDate < startOfMonth) {
        return total;
      }
      const amount = Number(transaction.amount || 0);
      if (transaction.type === "expense") {
        return total - amount;
      }
      if (transaction.type === "income") {
        return total + amount;
      }
      return total;
    }, 0);
  }, [transactions]);

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

  const actionClass =
    "rounded-full border border-slate-900 px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md";

  return (
    <div className="min-h-screen px-5 py-12 pb-20 sm:px-8 lg:px-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-slate-200/70 bg-white/75 p-6 shadow-[0_18px_40px_rgba(20,24,36,0.08)] backdrop-blur">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-500">
            Monetra
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Read-only dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {userEmail ? `Signed in as ${userEmail}.` : "Welcome back."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/accounts" className={`${actionClass} bg-transparent text-slate-900`}>
            Manage accounts
          </Link>
          <Link href="/pay-schedules" className={`${actionClass} bg-transparent text-slate-900`}>
            Pay schedules
          </Link>
          <Link href="/investments" className={`${actionClass} bg-transparent text-slate-900`}>
            Investments
          </Link>
          <Link href="/transactions" className={`${actionClass} bg-transparent text-slate-900`}>
            View transactions
          </Link>
          <Link href="/budget" className={`${actionClass} bg-transparent text-slate-900`}>
            Budget settings
          </Link>
          <SignOutButton className={`${actionClass} bg-slate-900 text-white`} />
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6 bg-gradient-to-br from-amber-100 to-blue-50">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
              Net flow · {monthLabel}
            </p>
            <p className="mt-3 text-4xl font-semibold text-slate-900 sm:text-5xl">
              {currencyFormatter.format(netFlow)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Income minus expenses for the current month.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
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

        <ExpenseGroupPieChart
          className="lg:col-span-4"
          data={expenseGroups}
          loading={expenseGroupsLoading}
          error={expenseGroupsError}
          month={expenseGroupsMonth}
          onMonthChange={setExpenseGroupsMonth}
          title="Expense groups"
          description="Needs, wants, investments, and savings this month."
        />

        <Card className="lg:col-span-8">
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

        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle>Expense categories</CardTitle>
            <CardDescription>
              Share of spending by category this month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {breakdownLoading ? <p>Loading category breakdown...</p> : null}
            {breakdownError ? (
              <p className="text-rose-600">{breakdownError}</p>
            ) : null}
            {!breakdownLoading && !breakdownError ? (
              <CategoryBreakdownChart data={categoryBreakdown} />
            ) : null}
          </CardContent>
        </Card>

        <ExpenseLineChart />
      </main>
    </div>
  );
}

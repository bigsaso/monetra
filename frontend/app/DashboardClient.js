"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CategoryBreakdownChart from "./components/CategoryBreakdownChart";
import ExpenseLineChart from "./components/ExpenseLineChart";
import MonthlyCashflowChart from "./components/MonthlyCashflowChart";
import SignOutButton from "./components/SignOutButton";
import { useCategoryBreakdown } from "../lib/useCategoryBreakdown";
import { useMonthlyTrends } from "../lib/useMonthlyTrends";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export default function DashboardClient({ userEmail }) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [budgetEvaluations, setBudgetEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState("");
  const {
    data: monthlyTrends,
    loading: trendsLoading,
    error: trendsError
  } = useMonthlyTrends();
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

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monetra</p>
          <h1>Read-only dashboard</h1>
          <p className="subtle">
            {userEmail ? `Signed in as ${userEmail}.` : "Welcome back."}
          </p>
        </div>
        <div className="actions">
          <Link href="/accounts" className="ghost">
            Manage accounts
          </Link>
          <Link href="/pay-schedules" className="ghost">
            Pay schedules
          </Link>
          <Link href="/transactions" className="ghost">
            View transactions
          </Link>
          <Link href="/budget" className="ghost">
            Budget settings
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="dashboard">
        <section className="card highlight">
          <p className="card-title">Net flow · {monthLabel}</p>
          <p className="metric">{currencyFormatter.format(netFlow)}</p>
          <p className="subtle">
            Income minus expenses for the current month.
          </p>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Monthly cashflow</h2>
            <p className="subtle">Income, expenses, and net cashflow.</p>
          </div>
          {trendsLoading ? <p>Loading monthly cashflow...</p> : null}
          {trendsError ? <p className="error">{trendsError}</p> : null}
          {!trendsLoading && !trendsError ? (
            <MonthlyCashflowChart data={monthlyTrends} />
          ) : null}
        </section>

        <section className="card span">
          <div className="card-header">
            <h2>Budget overview</h2>
            <p className="subtle">Monthly rule status across categories.</p>
          </div>
          {budgetLoading ? <p>Loading budget rules...</p> : null}
          {budgetError ? <p className="error">{budgetError}</p> : null}
          {!budgetLoading && budgetEvaluations.length === 0 ? (
            <p>No budget rules to evaluate yet.</p>
          ) : (
            <div className="budget-rules">
              {budgetEvaluations.map((rule) => {
                const status = budgetStatus(rule);
                const progressValue = Math.round(budgetProgress(rule) * 100);
                return (
                  <article key={rule.rule_id} className="budget-rule">
                    <div className="budget-rule-header">
                      <div>
                        <p className="budget-name">{budgetRuleName(rule)}</p>
                        <p className="budget-meta">
                          {currencyFormatter.format(
                            Number(rule.current_value || 0)
                          )}{" "}
                          of{" "}
                          {currencyFormatter.format(Number(rule.amount || 0))}
                        </p>
                      </div>
                      <span className={`status-badge ${status.tone}`}>
                        {status.label}
                      </span>
                    </div>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuenow={progressValue}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span
                        className={`progress-fill ${status.tone}`}
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card span">
          <div className="card-header">
            <h2>Expense categories</h2>
            <p className="subtle">Share of spending by category this month.</p>
          </div>
          {breakdownLoading ? <p>Loading category breakdown...</p> : null}
          {breakdownError ? <p className="error">{breakdownError}</p> : null}
          {!breakdownLoading && !breakdownError ? (
            <CategoryBreakdownChart data={categoryBreakdown} />
          ) : null}
        </section>

        <ExpenseLineChart
          title="AMEX expenses"
          subtitle="Spend trend for AMEX-linked transactions."
          cardLabel="AMEX"
          accounts={accounts}
          transactions={transactions}
          loading={loading}
          error={error}
        />

        <ExpenseLineChart
          title="Visa expenses"
          subtitle="Spend trend for Visa-linked transactions."
          cardLabel="Visa"
          accounts={accounts}
          transactions={transactions}
          loading={loading}
          error={error}
        />
      </main>

      <style jsx>{`
        :global(body) {
          margin: 0;
          font-family: "Space Grotesk", "Segoe UI", sans-serif;
          background: radial-gradient(
              circle at top left,
              rgba(255, 244, 214, 0.7),
              transparent 55%
            ),
            radial-gradient(
              circle at 20% 40%,
              rgba(205, 232, 255, 0.6),
              transparent 50%
            ),
            #f7f4ef;
          color: #22252b;
        }

        .page {
          min-height: 100vh;
          padding: 48px clamp(20px, 4vw, 64px) 80px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .topbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          border: 1px solid rgba(34, 37, 43, 0.08);
          border-radius: 24px;
          padding: 24px 28px;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 40px rgba(20, 24, 36, 0.08);
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 12px;
          margin: 0 0 8px;
          color: #6b6f78;
        }

        h1 {
          margin: 0 0 6px;
          font-size: clamp(28px, 3vw, 40px);
        }

        .subtle {
          margin: 0;
          color: #666a73;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
        }

        .actions :global(button),
        .actions :global(a) {
          border-radius: 999px;
          border: 1px solid #2e2f33;
          padding: 10px 18px;
          font-size: 14px;
          background: #2e2f33;
          color: #f7f4ef;
          text-decoration: none;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .actions :global(.ghost) {
          background: transparent;
          color: #2e2f33;
        }

        .actions :global(a:hover),
        .actions :global(button:hover) {
          transform: translateY(-1px);
          box-shadow: 0 6px 12px rgba(20, 24, 36, 0.15);
        }

        .dashboard {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 24px;
        }

        .card {
          grid-column: span 6;
          border-radius: 24px;
          border: 1px solid rgba(34, 37, 43, 0.1);
          background: rgba(255, 255, 255, 0.82);
          padding: 24px;
          box-shadow: 0 16px 30px rgba(20, 24, 36, 0.08);
        }

        .card.highlight {
          background: linear-gradient(135deg, #fff2d2, #f5f8ff);
        }

        .card.span {
          grid-column: span 12;
        }

        .card-title {
          margin: 0 0 12px;
          font-weight: 600;
          color: #4b4f57;
        }

        .metric {
          font-size: clamp(32px, 4vw, 48px);
          margin: 0 0 6px;
        }

        .card-header h2 {
          margin: 0 0 6px;
          font-size: 20px;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .table th,
        .table td {
          padding: 12px 8px;
          border-bottom: 1px solid rgba(34, 37, 43, 0.08);
        }

        .caps {
          text-transform: capitalize;
        }

        .amount {
          font-variant-numeric: tabular-nums;
        }

        .amount.up {
          color: #1f7a4d;
        }

        .amount.down {
          color: #b23a3a;
        }

        .error {
          color: #b23a3a;
        }

        .budget-rules {
          display: grid;
          gap: 16px;
        }

        .budget-rule {
          border-radius: 18px;
          border: 1px solid rgba(34, 37, 43, 0.08);
          background: rgba(255, 255, 255, 0.7);
          padding: 16px 18px;
        }

        .budget-rule-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .budget-name {
          margin: 0;
          font-weight: 600;
          color: #2d3138;
        }

        .budget-meta {
          margin: 4px 0 0;
          font-size: 13px;
          color: #6b6f78;
        }

        .status-badge {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .status-badge.success {
          background: rgba(31, 122, 77, 0.12);
          color: #1f7a4d;
          border: 1px solid rgba(31, 122, 77, 0.25);
        }

        .status-badge.warning {
          background: rgba(196, 132, 26, 0.15);
          color: #9a5c07;
          border: 1px solid rgba(196, 132, 26, 0.3);
        }

        .status-badge.danger {
          background: rgba(178, 58, 58, 0.12);
          color: #b23a3a;
          border: 1px solid rgba(178, 58, 58, 0.3);
        }

        .progress {
          position: relative;
          margin-top: 12px;
          height: 10px;
          border-radius: 999px;
          background: rgba(34, 37, 43, 0.08);
          overflow: hidden;
        }

        .progress-fill {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: #1f7a4d;
        }

        .progress-fill.warning {
          background: #c4841a;
        }

        .progress-fill.danger {
          background: #b23a3a;
        }

        @media (max-width: 900px) {
          .card {
            grid-column: span 12;
          }

          .actions {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useMemo } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

export default function RecentTransactionsTable({
  transactions = [],
  accounts = [],
  loading = false,
  error = ""
}) {
  const recentTransactions = useMemo(
    () => transactions.slice(0, 10),
    [transactions]
  );

  return (
    <section className="card span">
      <div className="card-header">
        <h2>Last 10 transactions</h2>
        <p className="subtle">Newest activity across your accounts.</p>
      </div>
      {loading ? <p>Loading transactions...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && recentTransactions.length === 0 ? (
        <p>No transactions yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th align="left">Date</th>
              <th align="left">Account</th>
              <th align="left">Type</th>
              <th align="left">Category</th>
              <th align="right">Amount</th>
              <th align="left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.map((transaction) => {
              const account = accounts.find(
                (item) => item.id === transaction.account_id
              );
              return (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.date)}</td>
                  <td>{account?.name || "-"}</td>
                  <td className="caps">{transaction.type}</td>
                  <td>{transaction.category || "-"}</td>
                  <td align="right">
                    <span
                      className={
                        transaction.type === "expense"
                          ? "amount down"
                          : transaction.type === "income"
                            ? "amount up"
                            : "amount"
                      }
                    >
                      {transaction.type === "expense"
                        ? "-"
                        : transaction.type === "income"
                          ? "+"
                          : ""}
                      {currencyFormatter.format(
                        Number(transaction.amount || 0)
                      )}
                    </span>
                  </td>
                  <td>{transaction.notes || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

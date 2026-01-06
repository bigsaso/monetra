"use client";

import { useMemo } from "react";

export default function AccountTransactionsSummary({
  accounts = [],
  transactions = [],
  loading = false,
  error = ""
}) {
  const accountCounts = useMemo(() => {
    const counts = {};
    accounts.forEach((account) => {
      counts[account.id] = 0;
    });
    transactions.forEach((transaction) => {
      counts[transaction.account_id] =
        (counts[transaction.account_id] || 0) + 1;
    });
    return counts;
  }, [accounts, transactions]);

  return (
    <section className="card">
      <div className="card-header">
        <h2>Accounts</h2>
        <p className="subtle">Total transactions per account.</p>
      </div>
      {loading ? <p>Loading accounts...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading && accounts.length === 0 ? (
        <p>No accounts yet. Add one to start tracking.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th align="left">Account</th>
              <th align="left">Type</th>
              <th align="left">Institution</th>
              <th align="right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td className="caps">{account.type}</td>
                <td>{account.institution || "-"}</td>
                <td align="right">{accountCounts[account.id] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

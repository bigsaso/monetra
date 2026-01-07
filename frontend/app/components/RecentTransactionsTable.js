"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui/table";

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
    <Card className="lg:col-span-12">
      <CardHeader>
        <CardTitle>Last 10 transactions</CardTitle>
        <CardDescription>Newest activity across your accounts.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p>Loading transactions...</p> : null}
        {error ? <p className="text-rose-600">{error}</p> : null}
        {!loading && recentTransactions.length === 0 ? (
          <p>No transactions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.map((transaction) => {
                const account = accounts.find(
                  (item) => item.id === transaction.account_id
                );
                const amountTone =
                  transaction.type === "expense"
                    ? "text-rose-600"
                    : transaction.type === "income"
                      ? "text-emerald-600"
                      : "text-slate-700";
                return (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatDate(transaction.date)}</TableCell>
                    <TableCell>{account?.name || "-"}</TableCell>
                    <TableCell className="capitalize">
                      {transaction.type}
                    </TableCell>
                    <TableCell>{transaction.category || "-"}</TableCell>
                    <TableCell className={`text-right font-medium ${amountTone}`}>
                      {transaction.type === "expense"
                        ? "-"
                        : transaction.type === "income"
                          ? "+"
                          : ""}
                      {currencyFormatter.format(Number(transaction.amount || 0))}
                    </TableCell>
                    <TableCell>{transaction.notes || "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

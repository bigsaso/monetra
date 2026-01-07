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
    <Card className="lg:col-span-6">
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>Total transactions per account.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p>Loading accounts...</p> : null}
        {error ? <p className="text-rose-600">{error}</p> : null}
        {!loading && accounts.length === 0 ? (
          <p>No accounts yet. Add one to start tracking.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell className="capitalize">{account.type}</TableCell>
                  <TableCell>{account.institution || "-"}</TableCell>
                  <TableCell className="text-right">
                    {accountCounts[account.id] || 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

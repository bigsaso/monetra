"use client";

import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const formatProfitLoss = (value, currency, formatMoney) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
};

const getProfitLossClass = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    return "text-slate-600";
  }
  return amount > 0 ? "text-emerald-600" : "text-rose-600";
};

const renderMoney = (value, currency, formatMoney) => {
  if (value == null) {
    return "-";
  }
  return formatMoney(value, currency);
};

export default function RealizedInvestmentsCard({
  realized,
  loading,
  error,
  onConvert,
  convertDisabled,
  homeCurrency,
  formatMoney,
  quantityFormatter,
  isForeignCurrency
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Realized investments</CardTitle>
        <CardDescription>Completed sell transactions and their outcomes.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto md:overflow-visible">
        {loading ? <p>Loading realized activity...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && realized.length === 0 ? (
          <p>No realized sell activity yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investment</TableHead>
                <TableHead className="text-right">Quantity sold</TableHead>
                <TableHead className="text-right">Avg buy price</TableHead>
                <TableHead className="text-right">Sell price</TableHead>
                <TableHead className="text-right">Proceeds</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {realized.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">
                      {entry.investment_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {entry.investment_symbol || "-"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {quantityFormatter.format(Number(entry.quantity_sold || 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderMoney(entry.average_buy_price, entry.currency, formatMoney)}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderMoney(entry.sell_price_per_share, entry.currency, formatMoney)}
                  </TableCell>
                  <TableCell className="text-right">
                    {renderMoney(entry.total_proceeds, entry.currency, formatMoney)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${getProfitLossClass(
                      entry.realized_profit_loss
                    )}`}
                  >
                    {formatProfitLoss(
                      entry.realized_profit_loss,
                      entry.currency,
                      formatMoney
                    )}
                  </TableCell>
                  <TableCell>{entry.currency || "-"}</TableCell>
                  <TableCell>{entry.sell_date}</TableCell>
                  <TableCell>
                    {isForeignCurrency(entry.currency, homeCurrency) ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onConvert(entry)}
                        disabled={convertDisabled}
                      >
                        Convert to {homeCurrency}
                      </Button>
                    ) : null}
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

"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import { Button } from "./ui/button";
import { getCurrencyFormatter, normalizeCurrency } from "../../lib/currency";

const formatAmount = (amount, currency) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return "-";
  }
  const normalized = normalizeCurrency(currency);
  if (!normalized) {
    return numericAmount.toFixed(2);
  }
  return getCurrencyFormatter(normalized, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numericAmount);
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const DetailRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900">{value || "-"}</span>
  </div>
);

export default function TransactionDetailModal({
  open,
  onClose,
  transactionId,
  transaction,
  investmentLabel,
  loading,
  error
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          <DialogDescription>
            {transactionId ? `Transaction #${transactionId}` : "Review this transaction."}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-slate-600">Loading transaction details...</p>
        ) : null}
        <div className="grid gap-3">
          <DetailRow
            label="Amount"
            value={formatAmount(transaction?.amount, transaction?.currency)}
          />
          <DetailRow label="Currency" value={transaction?.currency || "-"} />
          <DetailRow label="Date" value={formatDate(transaction?.date)} />
          <DetailRow label="Category" value={transaction?.category || "-"} />
          <DetailRow label="Linked investment" value={investmentLabel || "-"} />
        </div>
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

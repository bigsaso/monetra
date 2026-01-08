"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "./ui/table";

export default function CsvImportPreviewModal({
  rows,
  accounts,
  categories,
  bulkCategory,
  onBulkCategoryChange,
  onRowsChange,
  onManageCategories,
  onClose,
  onConfirm,
  isImporting,
  importError,
  hasAccount,
  accountName,
  selectedAccountId,
  onAccountChange
}) {
  const hasMissingCategory = rows.some(
    (row) => !row.category || !row.category.trim()
  );
  const confirmDisabled =
    isImporting || rows.length === 0 || hasMissingCategory || !hasAccount;

  const handleRowCategoryChange = (index, nextCategory) => {
    onRowsChange((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], category: nextCategory };
      return next;
    });
  };

  const applyBulkCategory = () => {
    if (!bulkCategory) {
      return;
    }
    onRowsChange((prev) =>
      prev.map((row) => ({
        ...row,
        category: bulkCategory
      }))
    );
  };

  const handleRemoveRow = (rowId) => {
    if (!window.confirm("Remove this row from the import?")) {
      return;
    }
    onRowsChange((prev) => prev.filter((row) => row.id !== rowId));
  };

  const selectClass =
    "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const buttonClass =
    "rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";
  const ghostButtonClass =
    "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle>Preview CSV import</DialogTitle>
          <DialogDescription>
            {rows.length} transactions ready to review.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
            Import to account
            <select
              className={selectClass}
              value={selectedAccountId}
              onChange={(event) => onAccountChange(event.target.value)}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 ? (
                <option value="">No accounts available</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
            Bulk assign category
            <select
              className={selectClass}
              value={bulkCategory}
              onChange={(event) => onBulkCategoryChange(event.target.value)}
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={applyBulkCategory} className={ghostButtonClass}>
            Apply to all rows
          </button>
          <button type="button" onClick={onManageCategories} className={ghostButtonClass}>
            Add/manage categories
          </button>
        </div>

        {hasMissingCategory ? (
          <p className="text-sm text-rose-600">
            Every row needs a category before import.
          </p>
        ) : null}
        {!hasAccount ? (
          <p className="text-sm text-rose-600">
            Select an account before importing transactions.
          </p>
        ) : null}

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const missingCategory = !row.category || !row.category.trim();
                return (
                  <TableRow
                    key={row.id}
                    className={missingCategory ? "bg-rose-50" : undefined}
                  >
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="text-right">{row.amount}</TableCell>
                    <TableCell>
                      <select
                        className={selectClass}
                        value={row.category}
                        onChange={(event) =>
                          handleRowCategoryChange(index, event.target.value)
                        }
                        aria-invalid={missingCategory}
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.name}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      {missingCategory ? (
                        <div className="mt-1 text-xs text-rose-600">
                          Category required
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        className={ghostButtonClass}
                      >
                        Remove row
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {importError ? (
          <p className="text-sm text-rose-600">{importError}</p>
        ) : null}

        <DialogFooter className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            {accountName ? `Importing to ${accountName}` : "Account required"}
          </span>
          <div className="flex flex-wrap gap-2">
            <DialogClose asChild>
              <button type="button" className={ghostButtonClass}>
                Done reviewing
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className={buttonClass}
            >
              {isImporting ? "Importing..." : "Import transactions"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

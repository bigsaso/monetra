"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CategoryManagerModal from "../components/CategoryManagerModal";
import CsvImportPreviewModal from "../components/CsvImportPreviewModal";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";

const buildEmptyForm = (dateValue) => ({
  account_id: "",
  amount: "",
  type: "expense",
  category: "",
  date: dateValue,
  notes: ""
});

const normalizeAmount = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return Number.NaN;
  }
  let cleaned = raw;
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return negative ? -parsed : parsed;
};

const normalizeDate = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const trimmed = raw.split(" ")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const monthNameMatch = trimmed.match(
    /^(\d{1,2})[\/-]([A-Za-z]{3,9})[\/-](\d{2}|\d{4})$/
  );
  if (monthNameMatch) {
    const monthMap = {
      jan: "01",
      january: "01",
      feb: "02",
      february: "02",
      mar: "03",
      march: "03",
      apr: "04",
      april: "04",
      may: "05",
      jun: "06",
      june: "06",
      jul: "07",
      july: "07",
      aug: "08",
      august: "08",
      sep: "09",
      sept: "09",
      september: "09",
      oct: "10",
      october: "10",
      nov: "11",
      november: "11",
      dec: "12",
      december: "12"
    };
    const day = monthNameMatch[1].padStart(2, "0");
    const monthKey = monthNameMatch[2].toLowerCase();
    const month = monthMap[monthKey];
    if (!month) {
      return trimmed;
    }
    let year = monthNameMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  const match = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (!match) {
    return trimmed;
  }
  let year = match[3];
  if (year.length === 2) {
    year = `20${year}`;
  }
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidIsoDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const formatImportError = (detail) => {
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || JSON.stringify(item))
      .join(" ");
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (detail) {
    return JSON.stringify(detail);
  }
  return "Failed to import transactions.";
};

const formatAmountSign = (type) => {
  if (type === "expense") {
    return "-";
  }
  if (type === "income") {
    return "+";
  }
  return "";
};

const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((columns) =>
    columns.some((column) => column && column.trim())
  );
};

const buildPreviewRows = (text) => {
  const rows = parseCsvText(text);
  if (rows.length < 1) {
    throw new Error("CSV must include at least one entry.");
  }

  const looksLikeHeaderless = (row) => {
    if (row.length < 3) {
      return false;
    }
    const dateValue = normalizeDate(row[0]);
    if (!isValidIsoDate(dateValue)) {
      return false;
    }
    const amountValue = normalizeAmount(row[2]);
    return Number.isFinite(amountValue);
  };

  const headers = rows[0].map((header) => header.trim());
  const normalized = headers.map((header) => header.toLowerCase());

  const findHeaderIndex = (matcher) =>
    normalized.findIndex((header) => matcher(header));

  const dateIndex = findHeaderIndex(
    (header) => header === "date" || header.includes("date")
  );
  const descriptionIndex = findHeaderIndex(
    (header) =>
      header === "description" ||
      header.includes("description") ||
      header.includes("merchant") ||
      header.includes("memo")
  );
  const amountIndex = findHeaderIndex(
    (header) => header === "amount" || header.includes("amount")
  );
  const categoryIndex = findHeaderIndex(
    (header) => header === "category" || header.includes("category")
  );

  let dataRows = rows.slice(1);
  let resolvedDateIndex = dateIndex;
  let resolvedDescriptionIndex = descriptionIndex;
  let resolvedAmountIndex = amountIndex;
  let resolvedCategoryIndex = categoryIndex;

  if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) {
    if (looksLikeHeaderless(rows[0])) {
      dataRows = rows;
      resolvedDateIndex = 0;
      resolvedDescriptionIndex = 1;
      resolvedAmountIndex = 2;
      resolvedCategoryIndex = -1;
    } else {
      throw new Error("CSV needs columns for date, description, and amount.");
    }
  }

  return dataRows.map((row, index) => ({
    id: `csv-${index}`,
    date: row[resolvedDateIndex]?.trim() || "",
    description: row[resolvedDescriptionIndex]?.trim() || "",
    amount: row[resolvedAmountIndex]?.trim() || "",
    category:
      resolvedCategoryIndex >= 0
        ? row[resolvedCategoryIndex]?.trim() || ""
        : ""
  }));
};

export default function TransactionsClient() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(buildEmptyForm(today));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [importCommitError, setImportCommitError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [importSaving, setImportSaving] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importAccountId, setImportAccountId] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }),
    []
  );
  const totalPages = Math.max(
    1,
    Math.ceil(transactions.length / rowsPerPage)
  );
  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return transactions.slice(start, start + rowsPerPage);
  }, [currentPage, rowsPerPage, transactions]);

  useEffect(() => {
    setCurrentPage((prev) => {
      if (prev < 1) {
        return 1;
      }
      if (prev > totalPages) {
        return totalPages;
      }
      return prev;
    });
  }, [totalPages]);

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

  const loadCategories = async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const response = await fetch("/api/categories");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load categories.");
      }
      const data = await response.json();
      setCategories(data);
      return data;
    } catch (err) {
      setCategoriesError(err.message);
      return [];
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!importAccountId && accounts.length > 0) {
      setImportAccountId(String(accounts[0].id));
    }
  }, [accounts, importAccountId]);

  useEffect(() => {
    if (!addSuccess) return undefined;
    const timeoutId = setTimeout(() => {
      setAddSuccess("");
    }, 4000);
    return () => clearTimeout(timeoutId);
  }, [addSuccess]);

  useEffect(() => {
    if (accounts.length > 0 && !form.account_id) {
      setForm((prev) => ({ ...prev, account_id: String(accounts[0].id) }));
    }
  }, [accounts, form.account_id]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setAddSuccess("");
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.account_id) {
      setError("Select an account before adding a transaction.");
      return;
    }
    setSaving(true);
    setError("");
    setAddSuccess("");
    try {
      const payload = {
        account_id: Number(form.account_id),
        amount: Number(form.amount),
        type: form.type,
        category: form.category ? form.category.trim() : null,
        date: form.date,
        notes: form.notes || null
      };
      const response = await fetch(
        editingId ? `/api/transactions/${editingId}` : "/api/transactions",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save transaction.");
      }
      setEditingId(null);
      await loadData();
      if (!editingId) {
        setAddSuccess("Transaction added.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const accountLookup = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setAddSuccess("");
    setForm({
      account_id: String(transaction.account_id),
      amount: String(transaction.amount),
      type: transaction.type,
      category: transaction.category || "",
      date: transaction.date,
      notes: transaction.notes || ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setAddSuccess("");
    setForm(buildEmptyForm(today));
  };

  const handleDelete = async (transactionId) => {
    if (!window.confirm("Delete this transaction?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to delete transaction.");
      }
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createCategory = async (name) => {
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || "Failed to create category.");
    }
    await loadCategories();
    setForm((prev) => ({ ...prev, category: data.name }));
  };

  const renameCategory = async (categoryId, nextName, previousName) => {
    const response = await fetch(`/api/categories/${categoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || "Failed to rename category.");
    }
    await loadCategories();
    if (form.category === previousName) {
      setForm((prev) => ({ ...prev, category: data.name }));
    }
  };

  const deleteCategory = async (categoryId, categoryName) => {
    const response = await fetch(`/api/categories/${categoryId}`, {
      method: "DELETE"
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.detail || "Failed to delete category.");
    }
    const refreshed = await loadCategories();
    if (form.category === categoryName) {
      setForm((prev) => ({
        ...prev,
        category: refreshed[0]?.name || ""
      }));
    }
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImportError("");
    setImportCommitError("");
    setImportSuccess("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const previewRows = buildPreviewRows(text);
        if (previewRows.length === 0) {
          throw new Error("No rows found in the CSV.");
        }
        setImportRows(previewRows);
        setBulkCategory("");
        setShowImportModal(true);
      } catch (err) {
        setImportError(err.message);
        setImportRows([]);
        setShowImportModal(false);
      }
    };
    reader.onerror = () => {
      setImportError("Failed to read CSV file.");
      setImportRows([]);
      setShowImportModal(false);
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setImportRows([]);
    setBulkCategory("");
    setImportCommitError("");
  };

  const handleImportRowsChange = (updater) => {
    setImportCommitError("");
    setImportRows(updater);
  };

  const handleCommitImport = async () => {
    if (!importAccountId) {
      setImportCommitError("Select an account before importing.");
      return;
    }
    if (importRows.length === 0) {
      setImportCommitError("No rows ready for import.");
      return;
    }
    const hasMissingCategory = importRows.some(
      (row) => !row.category || !row.category.trim()
    );
    if (hasMissingCategory) {
      setImportCommitError("Assign a category to every row before importing.");
      return;
    }
    const normalizedTransactions = [];
    for (const [index, row] of importRows.entries()) {
      const dateValue = normalizeDate(row.date);
      if (!isValidIsoDate(dateValue)) {
        setImportCommitError(
          `Row ${index + 1} has an invalid date. Use YYYY-MM-DD or MM/DD/YYYY.`
        );
        return;
      }
      const amountValue = normalizeAmount(row.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setImportCommitError(
          `Row ${index + 1} has an invalid amount. Use a positive number.`
        );
        return;
      }
      normalizedTransactions.push({
        date: dateValue,
        description: row.description,
        amount: amountValue,
        category: row.category ? row.category.trim() : ""
      });
    }
    setImportSaving(true);
    setImportCommitError("");
    try {
      const payload = {
        account_id: Number(importAccountId),
        transactions: normalizedTransactions
      };
      const response = await fetch("/api/transactions/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(formatImportError(data?.detail));
      }
      await loadData();
      handleCloseImportModal();
      setImportSuccess(
        `Imported ${data?.inserted_count || importRows.length} expenses.`
      );
    } catch (err) {
      setImportCommitError(err.message);
    } finally {
      setImportSaving(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const compactSelectClass =
    "ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const buttonClass =
    "rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";
  const ghostButtonClass =
    "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">Transactions</h1>
      <p className="mt-2 text-sm text-slate-500">
        Log income and expenses linked to your accounts.
      </p>

      <div className="mt-8 flex flex-wrap items-start gap-8">
        <Card className="flex-[2_1_420px]">
          <CardHeader>
            <CardTitle>{editingId ? "Edit transaction" : "Add transaction"}</CardTitle>
            <CardDescription>
              Capture a new income or expense linked to your accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-500">
              Set up an account before adding transactions.
            </p>
          ) : null}
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
            <label className="text-sm text-slate-600">
              Account
              <select
                className={inputClass}
                name="account_id"
                value={form.account_id}
                onChange={handleChange}
                disabled={accounts.length === 0}
                required
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
            <label className="text-sm text-slate-600">
              Type
              <select
                className={inputClass}
                name="type"
                value={form.type}
                onChange={handleChange}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="investment">Investment</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Amount
              <input
                className={inputClass}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={handleChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Category
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className={inputClass}
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  disabled={categoriesLoading}
                >
                  <option value="">Uncategorized</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                  {form.category &&
                  !categories.some(
                    (category) => category.name === form.category
                  ) ? (
                    <option value={form.category}>{form.category}</option>
                  ) : null}
                </select>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className={ghostButtonClass}
                >
                  Add/manage categories
                </button>
              </div>
            </label>
            {categoriesError ? (
              <p className="text-sm text-rose-600">{categoriesError}</p>
            ) : null}
            <label className="text-sm text-slate-600">
              Date
              <input
                className={inputClass}
                name="date"
                type="date"
                value={form.date}
                onChange={handleChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Notes
              <input
                className={inputClass}
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Optional"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={buttonClass}
                disabled={saving || accounts.length === 0}
              >
              {editingId ? "Save changes" : "Add transaction"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className={ghostButtonClass}
                  disabled={saving}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            {addSuccess ? (
              <p className="text-sm text-emerald-600">{addSuccess}</p>
            ) : null}
          </form>
          </CardContent>
        </Card>

        <Card className="flex-[1_1_260px]">
          <CardHeader>
            <CardTitle>Import expenses</CardTitle>
            <CardDescription>
              Upload a CSV to preview expenses before saving.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
            {importError ? (
              <p className="text-sm text-rose-600">{importError}</p>
            ) : null}
            {importSuccess ? (
              <p className="text-sm text-emerald-600">{importSuccess}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>
            Track the latest activity across your accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
        {!loading && transactions.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <label>
              Rows per page
              <select
                className={compactSelectClass}
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {[5, 10, 25, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className={ghostButtonClass}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage >= totalPages}
              className={ghostButtonClass}
            >
              Next
            </button>
          </div>
        ) : null}
        {loading ? <p>Loading transactions...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && transactions.length === 0 ? (
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{transaction.date}</TableCell>
                  <TableCell>{accountLookup[transaction.account_id] || "-"}</TableCell>
                  <TableCell className="capitalize">
                    {transaction.type}
                  </TableCell>
                  <TableCell>{transaction.category || "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatAmountSign(transaction.type)}
                    {currencyFormatter.format(Number(transaction.amount || 0))}
                  </TableCell>
                  <TableCell>{transaction.notes || "-"}</TableCell>
                  <TableCell className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(transaction)}
                      className={ghostButtonClass}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(transaction.id)}
                      disabled={saving}
                      className={ghostButtonClass}
                    >
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </CardContent>
      </Card>
      {showImportModal ? (
        <CsvImportPreviewModal
          rows={importRows}
          accounts={accounts}
          categories={categories}
          bulkCategory={bulkCategory}
          onBulkCategoryChange={setBulkCategory}
          onRowsChange={handleImportRowsChange}
          onManageCategories={() => setShowCategoryModal(true)}
          onClose={handleCloseImportModal}
          onConfirm={handleCommitImport}
          isImporting={importSaving}
          importError={importCommitError}
          hasAccount={Boolean(importAccountId)}
          accountName={
            importAccountId ? accountLookup[Number(importAccountId)] : ""
          }
          selectedAccountId={importAccountId}
          onAccountChange={setImportAccountId}
        />
      ) : null}
      {showCategoryModal ? (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onCreate={createCategory}
          onRename={renameCategory}
          onDelete={deleteCategory}
        />
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../components/ui/table";

const emptyForm = {
  amount: "",
  start_date: "",
  account_id: "",
  frequency: "biweekly",
  kind: "income",
  category_id: "",
  notes: ""
};

const isValidIsoDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

const scheduleKindOptions = [
  {
    value: "income",
    label: "Income",
    summary: "Salary, stipend, etc.",
    createDescription: "Track salary, stipend, and other recurring income.",
    editDescription: "Adjust your recurring income details.",
    amountLabel: "Amount (salary, stipend, etc.)",
    accountLabel: "Destination account",
    cadenceLabel: "Pay cadence",
    emptyLabel: "No income schedules yet."
  },
  {
    value: "expense",
    label: "Expense",
    summary: "Rent, car payment, subscription.",
    createDescription: "Track rent, car payments, and other recurring expenses.",
    editDescription: "Adjust your recurring expense details.",
    amountLabel: "Amount (rent, car payment, subscription)",
    accountLabel: "Payment account",
    cadenceLabel: "Billing cadence",
    emptyLabel: "No expense schedules yet."
  },
  {
    value: "investment",
    label: "Investment",
    summary: "FHSA contribution, TFSA contribution.",
    createDescription: "Plan recurring contributions like FHSA or TFSA deposits.",
    editDescription: "Adjust your recurring investment details.",
    amountLabel: "Amount (FHSA contribution, TFSA contribution)",
    accountLabel: "Contribution account",
    cadenceLabel: "Contribution cadence",
    emptyLabel: "No investment schedules yet."
  }
];

const scheduleKindLookup = scheduleKindOptions.reduce((acc, option) => {
  acc[option.value] = option;
  return acc;
}, {});

export default function RecurringSchedulesClient() {
  const [schedules, setSchedules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD"
      }),
    []
  );

  const loadSchedules = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recurring-schedules");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load recurring schedules.");
      }
      const data = await response.json();
      setSchedules(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    setAccountsLoading(true);
    setError("");
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load accounts.");
      }
      const data = await response.json();
      setAccounts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAccountsLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    setError("");
    try {
      const response = await fetch("/api/categories");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load categories.");
      }
      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadCategories();
    loadSchedules();
  }, []);

  useEffect(() => {
    if (accounts.length > 0 && !form.account_id) {
      setForm((prev) => ({ ...prev, account_id: String(accounts[0].id) }));
    }
  }, [accounts, form.account_id]);

  const accountLookup = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const categoryLookup = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category.id] = category.name;
      return acc;
    }, {});
  }, [categories]);

  const schedulesByKind = useMemo(() => {
    const grouped = scheduleKindOptions.reduce((acc, option) => {
      acc[option.value] = [];
      return acc;
    }, {});
    schedules.forEach((schedule) => {
      const normalizedKind = scheduleKindLookup[schedule.kind] ? schedule.kind : "income";
      grouped[normalizedKind].push(schedule);
    });
    return grouped;
  }, [schedules]);

  const selectedKind = scheduleKindLookup[form.kind] || scheduleKindOptions[0];
  const selectedEditKind = scheduleKindLookup[editForm.kind] || scheduleKindOptions[0];

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter an amount above $0.");
      return;
    }
    if (!form.start_date || !isValidIsoDate(form.start_date)) {
      setError("Enter a valid start date.");
      return;
    }
    if (!form.account_id) {
      setError("Select an account for this schedule.");
      return;
    }
    if (!form.frequency) {
      setError("Select a frequency for this schedule.");
      return;
    }
    if (!form.kind) {
      setError("Select a schedule type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const categoryId = form.category_id ? Number(form.category_id) : null;
      const payload = {
        amount: Number(form.amount),
        start_date: form.start_date,
        account_id: Number(form.account_id),
        frequency: form.frequency,
        kind: form.kind,
        category_id: categoryId,
        notes: form.notes || null
      };
      const response = await fetch("/api/recurring-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save recurring schedule.");
      }
      setForm((prev) => ({ ...prev, amount: "", start_date: "", notes: "" }));
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (schedule) => {
    setEditingId(schedule.id);
    setError("");
    setEditForm({
      amount: String(schedule.amount),
      start_date: schedule.start_date,
      account_id: String(schedule.account_id),
      frequency: schedule.frequency || "biweekly",
      kind: scheduleKindLookup[schedule.kind] ? schedule.kind : "income",
      category_id: schedule.category_id ? String(schedule.category_id) : "",
      notes: schedule.notes || ""
    });
    setIsEditOpen(true);
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editForm.amount || Number(editForm.amount) <= 0) {
      setError("Enter an amount above $0.");
      return;
    }
    if (!editForm.start_date || !isValidIsoDate(editForm.start_date)) {
      setError("Enter a valid start date.");
      return;
    }
    if (!editForm.account_id) {
      setError("Select an account for this schedule.");
      return;
    }
    if (!editForm.frequency) {
      setError("Select a frequency for this schedule.");
      return;
    }
    if (!editForm.kind) {
      setError("Select a schedule type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const categoryId = editForm.category_id ? Number(editForm.category_id) : null;
      const payload = {
        amount: Number(editForm.amount),
        start_date: editForm.start_date,
        account_id: Number(editForm.account_id),
        frequency: editForm.frequency,
        kind: editForm.kind,
        category_id: categoryId,
        notes: editForm.notes || null
      };
      const response = await fetch(`/api/recurring-schedules/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save recurring schedule.");
      }
      setEditingId(null);
      setIsEditOpen(false);
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setIsEditOpen(false);
    setEditForm(emptyForm);
    setError("");
  };

  const handleDelete = async (scheduleId) => {
    if (!window.confirm("Delete this recurring schedule?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/recurring-schedules/${scheduleId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to delete recurring schedule.");
      }
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-full px-4 py-10 sm:max-w-3xl">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        Recurring schedules
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Manage repeating income, expense, and investment schedules.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add recurring schedule</CardTitle>
            <CardDescription>{selectedKind.createDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
                Schedule type
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="kind"
                  value={form.kind}
                  onChange={handleChange}
                >
                  {scheduleKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-400">
                  {selectedKind.summary}
                </span>
              </label>
              <label className="text-sm text-slate-600">
                {selectedKind.amountLabel}
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                Start date
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={handleChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                {selectedKind.accountLabel}
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="account_id"
                  value={form.account_id}
                  onChange={handleChange}
                  disabled={accountsLoading}
                >
                  {accounts.length === 0 ? (
                    <option value="">No accounts available</option>
                  ) : null}
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Category (optional)
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="category_id"
                  value={form.category_id}
                  onChange={handleChange}
                  disabled={categoriesLoading}
                >
                  <option value="">No category</option>
                  {categories.length === 0 ? (
                    <option value="" disabled>
                      No categories available
                    </option>
                  ) : null}
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Notes (optional)
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="notes"
                  rows={3}
                  value={form.notes}
                  onChange={handleChange}
                />
              </label>
              <label className="text-sm text-slate-600">
                {selectedKind.cadenceLabel}
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="frequency"
                  value={form.frequency}
                  onChange={handleChange}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add schedule
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your schedules</CardTitle>
            <CardDescription>Review schedules grouped by type.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {loading ? <p>Loading recurring schedules...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && schedules.length === 0 ? (
              <p>No recurring schedules yet.</p>
            ) : (
              <div className="grid gap-6">
                {scheduleKindOptions.map((option) => {
                  const items = schedulesByKind[option.value] || [];
                  return (
                    <div key={option.value} className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {option.label}
                        </h3>
                        <p className="text-xs text-slate-500">{option.summary}</p>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          {option.emptyLabel}
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Amount</TableHead>
                              <TableHead>Start date</TableHead>
                              <TableHead>Account</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Notes</TableHead>
                              <TableHead>Frequency</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((schedule) => (
                              <TableRow key={schedule.id}>
                                <TableCell>
                                  {currencyFormatter.format(schedule.amount)}
                                </TableCell>
                                <TableCell>{formatDate(schedule.start_date)}</TableCell>
                                <TableCell>{accountLookup[schedule.account_id] || "-"}</TableCell>
                                <TableCell>
                                  {schedule.category_id
                                    ? categoryLookup[schedule.category_id] || "-"
                                    : "-"}
                                </TableCell>
                                <TableCell>{schedule.notes || "-"}</TableCell>
                                <TableCell className="capitalize">
                                  {schedule.frequency}
                                </TableCell>
                                <TableCell className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(schedule)}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(schedule.id)}
                                    disabled={saving}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Delete
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleEditCancel();
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit recurring schedule</DialogTitle>
            <DialogDescription>{selectedEditKind.editDescription}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="grid gap-4">
            <label className="text-sm text-slate-600">
              Schedule type
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="kind"
                value={editForm.kind}
                onChange={handleEditChange}
              >
                {scheduleKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                {selectedEditKind.summary}
              </span>
            </label>
            <label className="text-sm text-slate-600">
              {selectedEditKind.amountLabel}
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                value={editForm.amount}
                onChange={handleEditChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Start date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="start_date"
                type="date"
                value={editForm.start_date}
                onChange={handleEditChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              {selectedEditKind.accountLabel}
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="account_id"
                value={editForm.account_id}
                onChange={handleEditChange}
                disabled={accountsLoading}
              >
                {accounts.length === 0 ? (
                  <option value="">No accounts available</option>
                ) : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Category (optional)
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="category_id"
                value={editForm.category_id}
                onChange={handleEditChange}
                disabled={categoriesLoading}
              >
                <option value="">No category</option>
                {categories.length === 0 ? (
                  <option value="" disabled>
                    No categories available
                  </option>
                ) : null}
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Notes (optional)
              <textarea
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="notes"
                rows={3}
                value={editForm.notes}
                onChange={handleEditChange}
              />
            </label>
            <label className="text-sm text-slate-600">
              {selectedEditKind.cadenceLabel}
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="frequency"
                value={editForm.frequency}
                onChange={handleEditChange}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <DialogFooter>
              <DialogClose asChild>
                <button
                  type="button"
                  onClick={handleEditCancel}
                  disabled={saving}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

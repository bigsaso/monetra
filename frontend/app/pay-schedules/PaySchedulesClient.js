"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";

const emptyForm = {
  amount: "",
  start_date: "",
  account_id: "",
  frequency: "biweekly"
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

export default function PaySchedulesClient() {
  const [schedules, setSchedules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
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
      const response = await fetch("/api/pay-schedules");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load pay schedules.");
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

  useEffect(() => {
    loadAccounts();
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a pay amount above $0.");
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

    setSaving(true);
    setError("");
    try {
      const payload = {
        amount: Number(form.amount),
        start_date: form.start_date,
        account_id: Number(form.account_id),
        frequency: form.frequency
      };
      const response = await fetch("/api/pay-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save pay schedule.");
      }
      setForm((prev) => ({ ...prev, amount: "", start_date: "" }));
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
      frequency: schedule.frequency || "biweekly"
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
      setError("Enter a pay amount above $0.");
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

    setSaving(true);
    setError("");
    try {
      const payload = {
        amount: Number(editForm.amount),
        start_date: editForm.start_date,
        account_id: Number(editForm.account_id),
        frequency: editForm.frequency
      };
      const response = await fetch(`/api/pay-schedules/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save pay schedule.");
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
    if (!window.confirm("Delete this pay schedule?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/pay-schedules/${scheduleId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to delete pay schedule.");
      }
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        Pay schedules
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Manage repeating pay days and their destination accounts.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add pay schedule</CardTitle>
            <CardDescription>Keep recurring income organized.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
                Amount
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
                Account
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
                Frequency
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="frequency"
                  value={form.frequency}
                  onChange={handleChange}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
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
            <CardDescription>Review upcoming income cadence.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <p>Loading pay schedules...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && schedules.length === 0 ? (
              <p>No pay schedules yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Start date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        {currencyFormatter.format(schedule.amount)}
                      </TableCell>
                      <TableCell>{formatDate(schedule.start_date)}</TableCell>
                      <TableCell>{accountLookup[schedule.account_id] || "-"}</TableCell>
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
            <DialogTitle>Edit pay schedule</DialogTitle>
            <DialogDescription>Adjust your recurring income details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="grid gap-4">
            <label className="text-sm text-slate-600">
              Amount
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
              Account
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
              Frequency
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="frequency"
                value={editForm.frequency}
                onChange={handleEditChange}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

const emptyForm = { name: "", type: "checking", institution: "" };

export default function AccountsClient() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save account.");
      }
      setForm(emptyForm);
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingId(account.id);
    setError("");
    setEditForm({
      name: account.name,
      type: account.type,
      institution: account.institution || ""
    });
    setIsEditOpen(true);
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save account.");
      }
      setEditingId(null);
      setIsEditOpen(false);
      setEditForm(emptyForm);
      await loadAccounts();
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

  const handleDelete = async (accountId) => {
    if (!window.confirm("Delete this account?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to delete account.");
      }
      await loadAccounts();
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
        Financial Accounts
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Track the accounts you use for spending and investing.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add account</CardTitle>
            <CardDescription>Keep your funding sources up to date.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
            Name
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </label>
              <label className="text-sm text-slate-600">
            Type
            <select
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              name="type"
              value={form.type}
              onChange={handleChange}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit</option>
              <option value="investment">Investment</option>
            </select>
          </label>
              <label className="text-sm text-slate-600">
            Institution
            <input
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              name="institution"
              value={form.institution}
              onChange={handleChange}
              placeholder="Optional"
            />
          </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add account
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your accounts</CardTitle>
            <CardDescription>Review and edit existing account records.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {loading ? <p>Loading accounts...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && accounts.length === 0 ? (
              <p>No accounts yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.name}</TableCell>
                      <TableCell className="capitalize">{account.type}</TableCell>
                      <TableCell>{account.institution || "-"}</TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(account)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(account.id)}
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
            <DialogTitle>Edit account</DialogTitle>
            <DialogDescription>Update the account details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="grid gap-4">
            <label className="text-sm text-slate-600">
              Name
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="name"
                value={editForm.name}
                onChange={handleEditChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Type
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="type"
                value={editForm.type}
                onChange={handleEditChange}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit</option>
                <option value="investment">Investment</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Institution
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="institution"
                value={editForm.institution}
                onChange={handleEditChange}
                placeholder="Optional"
              />
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

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

const emptyForm = { name: "", symbol: "", asset_type: "stock" };

const assetTypeOptions = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "crypto", label: "Crypto" },
  { value: "bond", label: "Bond" },
  { value: "cash", label: "Cash" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" }
];

const formatAssetType = (value) => {
  if (!value) return "-";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export default function InvestmentsClient() {
  const [investments, setInvestments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    []
  );

  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
      }),
    []
  );

  const loadInvestments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/investments");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investments.");
      }
      const data = await response.json();
      setInvestments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const response = await fetch("/api/investments/activity");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investment activity.");
      }
      const data = await response.json();
      setActivity(data);
    } catch (err) {
      setActivityError(err.message);
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    loadInvestments();
    loadActivity();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Enter an investment name.");
      return;
    }
    if (!form.asset_type) {
      setError("Select an asset type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        symbol: form.symbol,
        asset_type: form.asset_type
      };
      const response = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save investment.");
      }
      setForm(emptyForm);
      await loadInvestments();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (investment) => {
    setEditingId(investment.id);
    setError("");
    setEditForm({
      name: investment.name,
      symbol: investment.symbol || "",
      asset_type: investment.asset_type || "stock"
    });
    setIsEditOpen(true);
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();
    if (!editForm.name.trim()) {
      setError("Enter an investment name.");
      return;
    }
    if (!editForm.asset_type) {
      setError("Select an asset type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: editForm.name,
        symbol: editForm.symbol,
        asset_type: editForm.asset_type
      };
      const response = await fetch(`/api/investments/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save investment.");
      }
      setEditingId(null);
      setIsEditOpen(false);
      await loadInvestments();
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

  const handleDelete = async (investmentId) => {
    if (!window.confirm("Delete this investment?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/investments/${investmentId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to delete investment.");
      }
      await loadInvestments();
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
        Investment assets
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Maintain the holdings you track and map to investment expenses.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add investment</CardTitle>
            <CardDescription>Store the tickers and asset types you track.</CardDescription>
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
                Symbol
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="symbol"
                  value={form.symbol}
                  onChange={handleChange}
                  placeholder="Optional"
                />
              </label>
              <label className="text-sm text-slate-600">
                Asset type
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="asset_type"
                  value={form.asset_type}
                  onChange={handleChange}
                >
                  {assetTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  Add investment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your investments</CardTitle>
            <CardDescription>Review and update tracked assets.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {loading ? <p>Loading investments...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            {!loading && investments.length === 0 ? (
              <p>No investments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Asset type</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((investment) => (
                    <TableRow key={investment.id}>
                      <TableCell>{investment.name}</TableCell>
                      <TableCell>{investment.symbol || "-"}</TableCell>
                      <TableCell>{formatAssetType(investment.asset_type)}</TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleEdit(investment)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleDelete(investment.id)}
                          disabled={saving}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Investment activity</CardTitle>
            <CardDescription>Review buy and sell activity tied to transactions.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {activityLoading ? <p>Loading activity...</p> : null}
            {activityError ? (
              <p className="text-sm text-rose-600">{activityError}</p>
            ) : null}
            {!activityLoading && activity.length === 0 ? (
              <p>No investment activity yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investment</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Transaction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {entry.investment_name}
                        {entry.investment_symbol
                          ? ` (${entry.investment_symbol})`
                          : ""}
                      </TableCell>
                      <TableCell className="capitalize">{entry.type}</TableCell>
                      <TableCell className="text-right">
                        {quantityFormatter.format(Number(entry.quantity || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {currencyFormatter.format(Number(entry.price || 0))}
                      </TableCell>
                      <TableCell>{entry.date}</TableCell>
                      <TableCell>
                        <Link
                          className="text-sm font-medium text-slate-700 hover:text-slate-900"
                          href={`/transactions?transactionId=${entry.transaction_id}`}
                        >
                          View transaction #{entry.transaction_id}
                        </Link>
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
            <DialogTitle>Edit investment</DialogTitle>
            <DialogDescription>Update the investment details.</DialogDescription>
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
              Symbol
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="symbol"
                value={editForm.symbol}
                onChange={handleEditChange}
                placeholder="Optional"
              />
            </label>
            <label className="text-sm text-slate-600">
              Asset type
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="asset_type"
                value={editForm.asset_type}
                onChange={handleEditChange}
              >
                {assetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" onClick={handleEditCancel}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={saving}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

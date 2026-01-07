"use client";

import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";

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

export default function InvestmentManagerModal({
  investments,
  onClose,
  onCreate,
  onUpdate,
  onDelete
}) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditingChange = (event) => {
    const { name, value } = event.target;
    setEditingForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdd = async (event) => {
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
      await onCreate({
        name: form.name.trim(),
        symbol: form.symbol.trim(),
        asset_type: form.asset_type
      });
      setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (investmentId) => {
    if (!editingForm.name.trim()) {
      setError("Enter an investment name.");
      return;
    }
    if (!editingForm.asset_type) {
      setError("Select an asset type.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onUpdate(investmentId, {
        name: editingForm.name.trim(),
        symbol: editingForm.symbol.trim(),
        asset_type: editingForm.asset_type
      });
      setEditingId(null);
      setEditingForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (investment) => {
    if (!window.confirm("Delete this investment?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete(investment.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const buttonClass =
    "rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";
  const ghostButtonClass =
    "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="sm:max-w-[620px] max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle>Manage investments</DialogTitle>
          </div>
          <DialogClose asChild>
            <button type="button" className={ghostButtonClass} disabled={saving}>
              Close
            </button>
          </DialogClose>
        </DialogHeader>

        <form onSubmit={handleAdd} className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              Name
              <input
                className={inputClass}
                name="name"
                value={form.name}
                onChange={handleFormChange}
              />
            </label>
            <label className="text-sm text-slate-600">
              Symbol
              <input
                className={inputClass}
                name="symbol"
                value={form.symbol}
                onChange={handleFormChange}
                placeholder="Optional"
              />
            </label>
          </div>
          <label className="text-sm text-slate-600">
            Asset type
            <select
              className={inputClass}
              name="asset_type"
              value={form.asset_type}
              onChange={handleFormChange}
            >
              {assetTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClass} disabled={saving}>
            Add investment
          </button>
        </form>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="grid gap-3">
          {investments.length === 0 ? <p>No investments yet.</p> : null}
          {investments.map((investment) => (
            <div key={investment.id} className="grid gap-2 rounded-md border border-slate-200 p-3">
              {editingId === investment.id ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-sm text-slate-600">
                      Name
                      <input
                        className={inputClass}
                        name="name"
                        value={editingForm.name}
                        onChange={handleEditingChange}
                        disabled={saving}
                      />
                    </label>
                    <label className="text-sm text-slate-600">
                      Symbol
                      <input
                        className={inputClass}
                        name="symbol"
                        value={editingForm.symbol}
                        onChange={handleEditingChange}
                        disabled={saving}
                      />
                    </label>
                  </div>
                  <label className="text-sm text-slate-600">
                    Asset type
                    <select
                      className={inputClass}
                      name="asset_type"
                      value={editingForm.asset_type}
                      onChange={handleEditingChange}
                      disabled={saving}
                    >
                      {assetTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdate(investment.id)}
                      className={buttonClass}
                      disabled={saving}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingForm(emptyForm);
                      }}
                      className={ghostButtonClass}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {investment.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {investment.symbol || "-"} • {formatAssetType(investment.asset_type)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(investment.id);
                          setEditingForm({
                            name: investment.name,
                            symbol: investment.symbol || "",
                            asset_type: investment.asset_type || "stock"
                          });
                          setError("");
                        }}
                        className={ghostButtonClass}
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(investment)}
                        className={ghostButtonClass}
                        disabled={saving}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <DialogDescription>
            Investments linked to transactions cannot be deleted.
          </DialogDescription>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

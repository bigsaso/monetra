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

export default function CategoryManagerModal({
  categories,
  onClose,
  onCreate,
  onRename,
  onDelete
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async (event) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError("Enter a category name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(trimmed);
      setNewName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (category) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setError("Enter a category name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onRename(category.id, trimmed, category.name);
      setEditingId(null);
      setEditingName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (!window.confirm("Delete this category?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onDelete(category.id, category.name);
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
      <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle>Manage categories</DialogTitle>
          </div>
          <DialogClose asChild>
            <button type="button" className={ghostButtonClass} disabled={saving}>
              Close
            </button>
          </DialogClose>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New category name"
            className={inputClass}
          />
          <button type="submit" className={buttonClass} disabled={saving}>
            Add category
          </button>
        </form>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="grid gap-3">
          {categories.length === 0 ? <p>No categories yet.</p> : null}
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex flex-wrap items-center gap-2"
            >
              {editingId === category.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    disabled={saving}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(category)}
                    className={buttonClass}
                    disabled={saving}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setEditingName("");
                    }}
                    className={ghostButtonClass}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-800">
                    {category.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                      setError("");
                    }}
                    className={ghostButtonClass}
                    disabled={saving}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    className={ghostButtonClass}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <DialogDescription>
            Categories in use cannot be deleted.
          </DialogDescription>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

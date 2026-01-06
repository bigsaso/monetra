"use client";

import { useState } from "react";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(18, 20, 24, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  zIndex: 1000
};

const modalStyle = {
  width: "min(560px, 100%)",
  background: "#ffffff",
  borderRadius: "16px",
  border: "1px solid rgba(34, 37, 43, 0.1)",
  boxShadow: "0 18px 40px rgba(20, 24, 36, 0.2)",
  padding: "24px",
  display: "grid",
  gap: "16px"
};

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

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Manage categories</h3>
          <button type="button" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <form
          onSubmit={handleAdd}
          style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
        >
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New category name"
          />
          <button type="submit" disabled={saving}>
            Add category
          </button>
        </form>

        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

        <div style={{ display: "grid", gap: "12px" }}>
          {categories.length === 0 ? <p>No categories yet.</p> : null}
          {categories.map((category) => (
            <div
              key={category.id}
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap"
              }}
            >
              {editingId === category.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(category)}
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
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: "1 1 auto" }}>{category.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                      setError("");
                    }}
                    disabled={saving}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    disabled={saving}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
          Categories in use cannot be deleted.
        </p>
      </div>
    </div>
  );
}

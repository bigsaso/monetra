"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const emptyForm = { name: "", type: "checking", institution: "" };

export default function AccountsClient() {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
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
      const response = await fetch(
        editingId ? `/api/accounts/${editingId}` : "/api/accounts",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form)
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save account.");
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      type: account.type,
      institution: account.institution || ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(emptyForm);
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
    <div style={{ maxWidth: "720px", margin: "40px auto", padding: "0 16px" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: "16px" }}>
        ← Back to dashboard
      </Link>
      <h1>Financial Accounts</h1>
      <p>Track the accounts you use for spending and investing.</p>

      <section style={{ marginBottom: "32px" }}>
        <h2>{editingId ? "Edit account" : "Add account"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
          <label>
            Name
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Type
            <select name="type" value={form.type} onChange={handleChange}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit</option>
              <option value="investment">Investment</option>
            </select>
          </label>
          <label>
            Institution
            <input
              name="institution"
              value={form.institution}
              onChange={handleChange}
              placeholder="Optional"
            />
          </label>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="submit" disabled={saving}>
              {editingId ? "Save changes" : "Add account"}
            </button>
            {editingId ? (
              <button type="button" onClick={handleCancel} disabled={saving}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section>
        <h2>Your accounts</h2>
        {loading ? <p>Loading accounts...</p> : null}
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
        {!loading && accounts.length === 0 ? (
          <p>No accounts yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Type</th>
                <th align="left">Institution</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td style={{ textTransform: "capitalize" }}>{account.type}</td>
                  <td>{account.institution || "-"}</td>
                  <td>
                    <button type="button" onClick={() => handleEdit(account)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => handleDelete(account.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const ruleTypeOptions = [
  { value: "monthly_cap", label: "Monthly cap" },
  { value: "weekly_cap", label: "Weekly cap" },
  { value: "one_time", label: "One-time cap" }
];

const categoryOptions = [
  "Groceries",
  "Rent",
  "Dining",
  "Utilities",
  "Travel",
  "Subscriptions",
  "Other"
];

const buildEmptyForm = () => ({
  type: "monthly_cap",
  amount: "",
  scope: "category",
  category: categoryOptions[0],
  account_id: ""
});

export default function BudgetClient() {
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(buildEmptyForm());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (form.scope === "account" && accounts.length > 0 && !form.account_id) {
      setForm((prev) => ({ ...prev, account_id: String(accounts[0].id) }));
    }
  }, [accounts, form.scope, form.account_id]);

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

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a budget amount above $0.");
      return;
    }
    if (form.scope === "account" && !form.account_id) {
      setError("Select an account for this rule.");
      return;
    }

    setSaving(true);
    setError("");
    const nextRule = {
      id: editingId || crypto.randomUUID(),
      type: form.type,
      amount: Number(form.amount),
      scope: form.scope,
      category: form.scope === "category" ? form.category : null,
      account_id:
        form.scope === "account" ? Number(form.account_id || 0) : null
    };

    setRules((prev) => {
      if (editingId) {
        return prev.map((rule) => (rule.id === editingId ? nextRule : rule));
      }
      return [nextRule, ...prev];
    });
    setForm(buildEmptyForm());
    setEditingId(null);
    setSaving(false);
  };

  const handleEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      type: rule.type,
      amount: String(rule.amount),
      scope: rule.scope,
      category: rule.category || categoryOptions[0],
      account_id: rule.account_id ? String(rule.account_id) : ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(buildEmptyForm());
    setError("");
  };

  const handleDelete = (ruleId) => {
    if (!window.confirm("Delete this rule?")) {
      return;
    }
    setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  return (
    <div style={{ maxWidth: "860px", margin: "40px auto", padding: "0 16px" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: "16px" }}>
        ← Back to dashboard
      </Link>
      <h1>Budget settings</h1>
      <p>Define guardrails for category and account spending.</p>

      <section style={{ marginBottom: "32px" }}>
        <h2>{editingId ? "Edit rule" : "Create rule"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
          <label>
            Rule type
            <select name="type" value={form.type} onChange={handleChange}>
              {ruleTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Applies to
            <select name="scope" value={form.scope} onChange={handleChange}>
              <option value="category">Category</option>
              <option value="account">Account</option>
            </select>
          </label>
          {form.scope === "category" ? (
            <label>
              Category
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Account
              <select
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
          )}
          {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button type="submit" disabled={saving || loading}>
              {editingId ? "Save changes" : "Add rule"}
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
        <h2>Existing rules</h2>
        {loading ? <p>Loading accounts...</p> : null}
        {!loading && rules.length === 0 ? <p>No rules yet.</p> : null}
        {rules.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Rule</th>
                <th align="left">Amount</th>
                <th align="left">Scope</th>
                <th align="left">Target</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    {
                      ruleTypeOptions.find(
                        (option) => option.value === rule.type
                      )?.label
                    }
                  </td>
                  <td>{currencyFormatter.format(rule.amount)}</td>
                  <td style={{ textTransform: "capitalize" }}>{rule.scope}</td>
                  <td>
                    {rule.scope === "category"
                      ? rule.category || "-"
                      : accountLookup[rule.account_id] || "-"}
                  </td>
                  <td>
                    <button type="button" onClick={() => handleEdit(rule)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}

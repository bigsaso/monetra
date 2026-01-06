"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CategoryManagerModal from "../components/CategoryManagerModal";

const ruleTypeOptions = [
  { value: "category_cap", label: "Category cap" },
  { value: "account_cap", label: "Account cap" },
  { value: "savings_target", label: "Savings target" }
];

const getDefaultCategory = (categories) => categories[0]?.name || "";

const buildEmptyForm = (categories) => ({
  rule_type: "category_cap",
  amount: "",
  category: getDefaultCategory(categories),
  account_id: ""
});

export default function BudgetClient() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(buildEmptyForm([]));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [categoriesError, setCategoriesError] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);

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

  const loadRules = async () => {
    setRulesLoading(true);
    setRulesError("");
    try {
      const response = await fetch("/api/budget/rules");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load budget rules.");
      }
      const data = await response.json();
      setRules(data);
    } catch (err) {
      setRulesError(err.message);
    } finally {
      setRulesLoading(false);
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
      setForm((prev) => ({
        ...prev,
        category: prev.category || getDefaultCategory(data)
      }));
      return data;
    } catch (err) {
      setCategoriesError(err.message);
      return [];
    } finally {
      setCategoriesLoading(false);
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
        category: getDefaultCategory(refreshed)
      }));
    }
  };

  useEffect(() => {
    loadAccounts();
    loadRules();
    loadCategories();
  }, []);

  useEffect(() => {
    if (
      form.rule_type === "account_cap" &&
      accounts.length > 0 &&
      !form.account_id
    ) {
      setForm((prev) => ({ ...prev, account_id: String(accounts[0].id) }));
    }
  }, [accounts, form.rule_type, form.account_id]);

  const accountLookup = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      if (name === "rule_type") {
        const defaultCategory = getDefaultCategory(categories);
        return {
          ...prev,
          rule_type: value,
          category:
            value === "category_cap"
              ? prev.category || defaultCategory
              : "",
          account_id: value === "account_cap" ? prev.account_id : ""
        };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a budget amount above $0.");
      return;
    }
    if (form.rule_type === "category_cap" && !form.category) {
      setError("Select a category for this rule.");
      return;
    }
    if (form.rule_type === "account_cap" && !form.account_id) {
      setError("Select an account for this rule.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        rule_type: form.rule_type,
        amount: Number(form.amount),
        category: form.rule_type === "category_cap" ? form.category : null,
        account_id:
          form.rule_type === "account_cap" ? Number(form.account_id || 0) : null
      };
      const response = await fetch(
        editingId ? `/api/budget/rules/${editingId}` : "/api/budget/rules",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to save budget rule.");
      }
      setRules((prev) => {
        if (editingId) {
          return prev.map((rule) => (rule.id === editingId ? data : rule));
        }
        return [data, ...prev];
      });
      setForm(buildEmptyForm(categories));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      rule_type: rule.rule_type,
      amount: String(rule.amount),
      category: rule.category || getDefaultCategory(categories),
      account_id: rule.account_id ? String(rule.account_id) : ""
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(buildEmptyForm(categories));
    setError("");
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm("Delete this rule?")) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/budget/rules/${ruleId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to delete budget rule.");
      }
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
            <select
              name="rule_type"
              value={form.rule_type}
              onChange={handleChange}
            >
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
          {form.rule_type === "category_cap" ? (
            <label>
              Category
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center"
                }}
              >
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  disabled={categoriesLoading}
                >
                  {categories.length === 0 ? (
                    <option value="">No categories available</option>
                  ) : null}
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
                >
                  Add/manage categories
                </button>
              </div>
            </label>
          ) : null}
          {form.rule_type === "account_cap" ? (
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
          ) : null}
          {categoriesError ? (
            <p style={{ color: "crimson" }}>{categoriesError}</p>
          ) : null}
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
        {rulesLoading ? <p>Loading rules...</p> : null}
        {rulesError ? <p style={{ color: "crimson" }}>{rulesError}</p> : null}
        {!rulesLoading && rules.length === 0 ? <p>No rules yet.</p> : null}
        {rules.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Rule</th>
                <th align="left">Amount</th>
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
                        (option) => option.value === rule.rule_type
                      )?.label
                    }
                  </td>
                  <td>{currencyFormatter.format(rule.amount)}</td>
                  <td>
                    {rule.rule_type === "category_cap"
                      ? rule.category || "-"
                      : rule.rule_type === "account_cap"
                      ? accountLookup[rule.account_id] || "-"
                      : "Net savings"}
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

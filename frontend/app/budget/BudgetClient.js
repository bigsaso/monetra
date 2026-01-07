"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CategoryManagerModal from "../components/CategoryManagerModal";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";

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
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        Budget settings
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Define guardrails for category and account spending.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Edit rule" : "Create rule"}</CardTitle>
            <CardDescription>Set guardrails for ongoing spending.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
                Rule type
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
              {form.rule_type === "category_cap" ? (
                <label className="text-sm text-slate-600">
                  Category
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      Add/manage categories
                    </button>
                  </div>
                </label>
              ) : null}
              {form.rule_type === "account_cap" ? (
                <label className="text-sm text-slate-600">
                  Account
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                <p className="text-sm text-rose-600">{categoriesError}</p>
              ) : null}
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingId ? "Save changes" : "Add rule"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing rules</CardTitle>
            <CardDescription>Review the budgets you have set.</CardDescription>
          </CardHeader>
          <CardContent>
            {rulesLoading ? <p>Loading rules...</p> : null}
            {rulesError ? <p className="text-sm text-rose-600">{rulesError}</p> : null}
            {!rulesLoading && rules.length === 0 ? <p>No rules yet.</p> : null}
            {rules.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        {
                          ruleTypeOptions.find(
                            (option) => option.value === rule.rule_type
                          )?.label
                        }
                      </TableCell>
                      <TableCell>
                        {currencyFormatter.format(rule.amount)}
                      </TableCell>
                      <TableCell>
                        {rule.rule_type === "category_cap"
                          ? rule.category || "-"
                          : rule.rule_type === "account_cap"
                          ? accountLookup[rule.account_id] || "-"
                          : "Net savings"}
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(rule)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule.id)}
                          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          Delete
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      </div>
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  const [editingId, setEditingId] = useState(null);
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
      const response = await fetch(
        editingId ? `/api/pay-schedules/${editingId}` : "/api/pay-schedules",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save pay schedule.");
      }
      setForm((prev) => ({ ...prev, amount: "", start_date: "" }));
      setEditingId(null);
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (schedule) => {
    setEditingId(schedule.id);
    setForm({
      amount: String(schedule.amount),
      start_date: schedule.start_date,
      account_id: String(schedule.account_id),
      frequency: schedule.frequency || "biweekly"
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm((prev) => ({
      ...prev,
      amount: "",
      start_date: "",
      account_id: prev.account_id || "",
      frequency: prev.frequency || "biweekly"
    }));
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
    <div style={{ maxWidth: "720px", margin: "40px auto", padding: "0 16px" }}>
      <Link href="/" style={{ display: "inline-block", marginBottom: "16px" }}>
        Back to dashboard
      </Link>
      <h1>Pay schedules</h1>
      <p>Manage repeating pay days and their destination accounts.</p>

      <section style={{ marginBottom: "32px" }}>
        <h2>{editingId ? "Edit pay schedule" : "Add pay schedule"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
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
            Start date
            <input
              name="start_date"
              type="date"
              value={form.start_date}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Account
            <select
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
          <label>
            Frequency
            <select
              name="frequency"
              value={form.frequency}
              onChange={handleChange}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: "12px" }}>
            <button type="submit" disabled={saving}>
              {editingId ? "Save changes" : "Add schedule"}
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
        <h2>Your schedules</h2>
        {loading ? <p>Loading pay schedules...</p> : null}
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
        {!loading && schedules.length === 0 ? (
          <p>No pay schedules yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Amount</th>
                <th align="left">Start date</th>
                <th align="left">Account</th>
                <th align="left">Frequency</th>
                <th align="left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id}>
                  <td>{currencyFormatter.format(schedule.amount)}</td>
                  <td>{formatDate(schedule.start_date)}</td>
                  <td>{accountLookup[schedule.account_id] || "-"}</td>
                  <td>{schedule.frequency}</td>
                  <td>
                    <button type="button" onClick={() => handleEdit(schedule)}>
                      Edit
                    </button>{" "}
                    <button
                      type="button"
                      onClick={() => handleDelete(schedule.id)}
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

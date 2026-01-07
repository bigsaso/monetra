"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MonthlyExpenseGroupBreakdown,
  MonthlyExpenseGroupsParams,
  MonthlyExpenseGroupsState
} from "./contracts";

const formatMonth = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;

export function useMonthlyExpenseGroups(
  params: MonthlyExpenseGroupsParams = {}
): MonthlyExpenseGroupsState {
  const resolvedMonth = useMemo(
    () => params.month ?? formatMonth(new Date()),
    [params.month]
  );
  const [data, setData] = useState<MonthlyExpenseGroupBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams();
        if (resolvedMonth) {
          searchParams.set("month", resolvedMonth);
        }
        const url = searchParams.toString()
          ? `/api/reports/monthly-expense-groups?${searchParams.toString()}`
          : "/api/reports/monthly-expense-groups";

        const response = await fetch(url);
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load expense group breakdown.");
        }
        const payload = await response.json();
        if (active) {
          setData(payload ?? null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load expense group breakdown.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [resolvedMonth]);

  return { data, loading, error };
}

"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} MonthlyTrend
 * @property {string} month
 * @property {number|string} total_income
 * @property {number|string} total_expenses
 * @property {number|string} total_regular_expenses
 * @property {number|string} total_investment_expenses
 * @property {number|string} net_cashflow
 * @property {number|string=} projected_total_income
 * @property {number|string=} projected_total_expenses
 * @property {number|string=} projected_total_regular_expenses
 * @property {number|string=} projected_total_investment_expenses
 * @property {number|string=} projected_total_income_current_month
 * @property {number|string=} projected_total_expenses_current_month
 * @property {number|string=} projected_total_regular_expenses_current_month
 * @property {number|string=} projected_total_investment_expenses_current_month
 * @property {string=} home_currency
 * @property {string[]=} source_currencies
 */

/**
 * @typedef {Object} MonthlyTrendsState
 * @property {MonthlyTrend[]} data
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * @typedef {Object} MonthlyTrendsParams
 * @property {string=} startDate
 * @property {string=} endDate
 */

/**
 * @param {MonthlyTrendsParams=} params
 * @returns {MonthlyTrendsState}
 */
export function useMonthlyTrends(params = {}) {
  const { startDate, endDate } = params;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams();
        if (startDate) {
          searchParams.set("start_date", startDate);
        }
        if (endDate) {
          searchParams.set("end_date", endDate);
        }
        const url = searchParams.toString()
          ? `/api/reports/monthly-trends?${searchParams.toString()}`
          : "/api/reports/monthly-trends";

        const response = await fetch(url);
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load monthly trends.");
        }
        const payload = await response.json();
        if (active) {
          setData(Array.isArray(payload) ? payload : []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load monthly trends.");
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
  }, [startDate, endDate]);

  return { data, loading, error };
}

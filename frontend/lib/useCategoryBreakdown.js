"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} CategoryBreakdownItem
 * @property {string} category
 * @property {number|string} total_spent
 * @property {number|string} percentage_of_total
 * @property {string=} home_currency
 * @property {string[]=} source_currencies
 */

/**
 * @typedef {Object} CategoryBreakdownState
 * @property {CategoryBreakdownItem[]} data
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * @typedef {Object} CategoryBreakdownParams
 * @property {string=} startDate
 * @property {string=} endDate
 */

/**
 * @param {CategoryBreakdownParams=} params
 * @returns {CategoryBreakdownState}
 */
export function useCategoryBreakdown(params = {}) {
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
          ? `/api/reports/category-breakdown?${searchParams.toString()}`
          : "/api/reports/category-breakdown";

        const response = await fetch(url);
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load category breakdown.");
        }
        const payload = await response.json();
        if (active) {
          setData(Array.isArray(payload) ? payload : []);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load category breakdown.");
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

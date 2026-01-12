"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} NetFlowSummary
 * @property {number|string} net_flow_current_month
 * @property {number|string} net_flow_previous_month
 * @property {number|string=} percentage_change
 * @property {string=} home_currency
 * @property {string[]=} source_currencies_current_month
 * @property {string[]=} source_currencies_previous_month
 */

/**
 * @typedef {Object} NetFlowSummaryState
 * @property {NetFlowSummary|null} data
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * @typedef {Object} NetFlowSummaryParams
 * @property {string=} month
 */

/**
 * @param {NetFlowSummaryParams=} params
 * @returns {NetFlowSummaryState}
 */
export function useNetFlowSummary(params = {}) {
  const { month } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams();
        if (month) {
          searchParams.set("month", month);
        }
        const url = searchParams.toString()
          ? `/api/reports/net-flow?${searchParams.toString()}`
          : "/api/reports/net-flow";
        const response = await fetch(url);
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load net flow.");
        }
        const payload = await response.json();
        if (active) {
          setData(payload || null);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load net flow.");
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
  }, [month]);

  return { data, loading, error };
}

"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} EquitySummaryItem
 * @property {number|string} shares
 * @property {number|string} value
 * @property {number|string=} cost_basis
 * @property {number|string=} pnl
 * @property {number|string=} pnl_pct
 */

/**
 * @typedef {Object} EquitySummary
 * @property {{ rsu: EquitySummaryItem }} unvested
 * @property {{ espp: EquitySummaryItem, rsu: EquitySummaryItem }} vested_unrealized
 * @property {{ espp: EquitySummaryItem, rsu: EquitySummaryItem }} vested_realized
 */

/**
 * @typedef {Object} EquitySummaryState
 * @property {EquitySummary|null} data
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * @returns {EquitySummaryState}
 */
export function useEquitySummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/reports/equity-summary");
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load equity summary.");
        }
        const payload = await response.json();
        if (active) {
          setData(payload || null);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load equity summary.");
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
  }, []);

  return { data, loading, error };
}

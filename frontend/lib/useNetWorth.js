"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} NetWorthInvestments
 * @property {number|string} espp
 * @property {number|string} rsu
 * @property {number|string} other
 */

/**
 * @typedef {Object} NetWorthAssets
 * @property {number|string} cash
 * @property {NetWorthInvestments} investments
 * @property {number|string} total_assets
 */

/**
 * @typedef {Object} NetWorthLiabilities
 * @property {number|string} total_liabilities
 */

/**
 * @typedef {Object} NetWorthResponse
 * @property {NetWorthAssets} assets
 * @property {NetWorthLiabilities} liabilities
 * @property {number|string} net_worth
 */

/**
 * @typedef {Object} NetWorthState
 * @property {NetWorthResponse|null} data
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * @returns {NetWorthState}
 */
export function useNetWorth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/reports/net-worth");
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.detail || "Failed to load net worth.");
        }
        const payload = await response.json();
        if (active) {
          setData(payload || null);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load net worth.");
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

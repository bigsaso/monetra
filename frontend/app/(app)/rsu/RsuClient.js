"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../components/ui/table";
import { CURRENCY_OPTIONS } from "../../../lib/currencies";

const normalizeCurrencyValue = (value) =>
  String(value || "").trim().toUpperCase();

const formatMoney = (value, currency) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const normalizedCurrency = normalizeCurrencyValue(currency);
  if (!normalizedCurrency) {
    return amount.toFixed(2);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (err) {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
};

const formatPrice = (value, currency) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  const normalizedCurrency = normalizeCurrencyValue(currency);
  if (!normalizedCurrency) {
    return amount.toFixed(5);
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 5
    }).format(amount);
  } catch (err) {
    return `${amount.toFixed(5)} ${normalizedCurrency}`;
  }
};

const buildGrantForm = (grantDate) => ({
  name: "",
  stock_ticker: "",
  stock_currency: "USD",
  grant_date: grantDate
});

const buildVestingPeriodForm = (vestDate) => ({
  vest_date: vestDate,
  granted_quantity: ""
});

const buildVestForm = (vestDate) => ({
  vest_date: vestDate,
  price_at_vesting: "",
  account_id: ""
});

const buildSellForm = (sellDate) => ({
  quantity: "",
  price: "",
  sell_date: sellDate,
  account_id: ""
});

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`);
};

const formatDateInput = (dateValue) => {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatShortDate = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return value || "-";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

export default function RsuClient() {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [grants, setGrants] = useState([]);
  const [grantsLoading, setGrantsLoading] = useState(true);
  const [grantsError, setGrantsError] = useState("");
  const [selectedGrantId, setSelectedGrantId] = useState("");
  const [vestingPeriods, setVestingPeriods] = useState([]);
  const [vestingLoading, setVestingLoading] = useState(false);
  const [vestingError, setVestingError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [accountsError, setAccountsError] = useState("");
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantForm, setGrantForm] = useState(buildGrantForm(today));
  const [grantSaving, setGrantSaving] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [rsuValuation, setRsuValuation] = useState(null);
  const [rsuValuationLoading, setRsuValuationLoading] = useState(false);
  const [rsuValuationError, setRsuValuationError] = useState("");
  const [rsuMarketQuote, setRsuMarketQuote] = useState(null);
  const [rsuMarketLoading, setRsuMarketLoading] = useState(false);
  const [rsuMarketError, setRsuMarketError] = useState("");
  const [addPeriodModalOpen, setAddPeriodModalOpen] = useState(false);
  const [addPeriodForm, setAddPeriodForm] = useState(
    buildVestingPeriodForm(today)
  );
  const [addPeriodSaving, setAddPeriodSaving] = useState(false);
  const [addPeriodError, setAddPeriodError] = useState("");
  const [vestModalOpen, setVestModalOpen] = useState(false);
  const [vestTarget, setVestTarget] = useState(null);
  const [vestForm, setVestForm] = useState(buildVestForm(""));
  const [vestSaving, setVestSaving] = useState(false);
  const [vestError, setVestError] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState(null);
  const [sellForm, setSellForm] = useState(buildSellForm(""));
  const [sellSaving, setSellSaving] = useState(false);
  const [sellError, setSellError] = useState("");

  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
      }),
    []
  );

  const selectedGrant = useMemo(
    () => grants.find((grant) => String(grant.id) === String(selectedGrantId)),
    [grants, selectedGrantId]
  );

  const rsuStockCurrency = useMemo(
    () => selectedGrant?.stock_currency || rsuValuation?.stock_currency,
    [rsuValuation?.stock_currency, selectedGrant?.stock_currency]
  );

  const investmentAccounts = useMemo(
    () => accounts.filter((account) => account.type === "investment"),
    [accounts]
  );

  const loadVestingPeriods = useCallback(async (grantId) => {
    if (!grantId) {
      setVestingPeriods([]);
      return;
    }
    setVestingLoading(true);
    setVestingError("");
    try {
      const response = await fetch(
        `/api/rsu-grants/${grantId}/vesting-periods`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to load vesting periods.");
      }
      setVestingPeriods(data || []);
    } catch (err) {
      setVestingError(err.message);
    } finally {
      setVestingLoading(false);
    }
  }, []);

  const loadRsuValuation = useCallback(async (grantId) => {
    if (!grantId) {
      setRsuValuation(null);
      return;
    }
    setRsuValuationLoading(true);
    setRsuValuationError("");
    try {
      const response = await fetch(`/api/rsu-grants/${grantId}/valuation`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to load RSU valuation.");
      }
      setRsuValuation(data || null);
    } catch (err) {
      setRsuValuationError(err.message);
      setRsuValuation(null);
    } finally {
      setRsuValuationLoading(false);
    }
  }, []);

  const hasVestedPeriods = useMemo(
    () => vestingPeriods.some((period) => period.status === "vested"),
    [vestingPeriods]
  );

  const hasUnvestedPeriods = useMemo(
    () => vestingPeriods.some((period) => period.status === "unvested"),
    [vestingPeriods]
  );

  const rsuLiveMetrics = useMemo(() => {
    const realizedValue =
      rsuValuation?.realized_value != null
        ? Number(rsuValuation.realized_value)
        : null;
    const livePrice = Number(rsuMarketQuote?.price || 0);
    const normalizedLivePrice =
      Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;
    const vestedShares = vestingPeriods.reduce((total, period) => {
      if (period.status !== "vested") {
        return total;
      }
      const sharesAvailable = Number(period.shares_available || 0);
      return Number.isFinite(sharesAvailable) ? total + sharesAvailable : total;
    }, 0);
    const unvestedShares = vestingPeriods.reduce((total, period) => {
      if (period.status !== "unvested") {
        return total;
      }
      const grantedQuantity = Number(period.granted_quantity || 0);
      return Number.isFinite(grantedQuantity) ? total + grantedQuantity : total;
    }, 0);
    const unrealizedValue =
      normalizedLivePrice != null && hasVestedPeriods
        ? vestedShares * normalizedLivePrice
        : null;
    const potentialValue =
      normalizedLivePrice != null && hasUnvestedPeriods
        ? unvestedShares * normalizedLivePrice
        : null;
    const totalValue =
      realizedValue != null && unrealizedValue != null
        ? realizedValue + unrealizedValue
        : null;
    return {
      realizedValue,
      livePrice: normalizedLivePrice,
      unrealizedValue,
      potentialValue,
      totalValue
    };
  }, [
    hasUnvestedPeriods,
    hasVestedPeriods,
    rsuMarketQuote?.price,
    rsuValuation,
    vestingPeriods
  ]);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const response = await fetch("/api/accounts");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load accounts.");
        }
        setAccounts(data || []);
      } catch (err) {
        setAccountsError(err.message);
      }
    };

    const loadGrants = async () => {
      setGrantsLoading(true);
      setGrantsError("");
      try {
        const response = await fetch("/api/rsu-grants");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load RSU grants.");
        }
        setGrants(data || []);
      } catch (err) {
        setGrantsError(err.message);
      } finally {
        setGrantsLoading(false);
      }
    };

    loadAccounts();
    loadGrants();
  }, []);

  useEffect(() => {
    if (grants.length === 0) {
      setSelectedGrantId("");
      return;
    }
    const stillExists = grants.some(
      (grant) => String(grant.id) === String(selectedGrantId)
    );
    if (!selectedGrantId || !stillExists) {
      setSelectedGrantId(String(grants[0].id));
    }
  }, [grants, selectedGrantId]);

  useEffect(() => {
    loadVestingPeriods(selectedGrantId);
  }, [loadVestingPeriods, selectedGrantId]);

  useEffect(() => {
    if (!selectedGrantId || vestingLoading) {
      setRsuValuation(null);
      setRsuValuationError("");
      return;
    }
    loadRsuValuation(selectedGrantId);
  }, [loadRsuValuation, selectedGrantId, vestingLoading]);

  useEffect(() => {
    if (!vestModalOpen) {
      return;
    }
    if (!vestForm.account_id && investmentAccounts.length === 1) {
      setVestForm((prev) => ({
        ...prev,
        account_id: String(investmentAccounts[0].id)
      }));
    }
  }, [vestModalOpen, vestForm.account_id, investmentAccounts]);

  useEffect(() => {
    if (!sellModalOpen) {
      return;
    }
    if (!sellForm.account_id && investmentAccounts.length === 1) {
      setSellForm((prev) => ({
        ...prev,
        account_id: String(investmentAccounts[0].id)
      }));
    }
  }, [sellModalOpen, sellForm.account_id, investmentAccounts]);

  useEffect(() => {
    if (!selectedGrantId || vestingLoading) {
      setRsuMarketQuote(null);
      setRsuMarketError("");
      setRsuMarketLoading(false);
      return;
    }
    const ticker = selectedGrant?.stock_ticker?.trim();
    if (!ticker) {
      setRsuMarketQuote(null);
      setRsuMarketError("Stock ticker required for live pricing.");
      setRsuMarketLoading(false);
      return;
    }
    let cancelled = false;
    const loadMarket = async () => {
      setRsuMarketLoading(true);
      setRsuMarketError("");
      try {
        const response = await fetch(
          `/api/market/quote?symbol=${encodeURIComponent(ticker)}`
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load live price.");
        }
        if (!cancelled) {
          setRsuMarketQuote(data);
        }
      } catch (err) {
        if (!cancelled) {
          const baseMessage =
            err.message || "Failed to load live market data.";
          const nextMessage = baseMessage.includes("Quote unavailable.")
            ? `${baseMessage} This could be caused by rate limiting. Retrying in 1 minute.`
            : baseMessage;
          setRsuMarketError(nextMessage);
          setRsuMarketQuote(null);
        }
      } finally {
        if (!cancelled) {
          setRsuMarketLoading(false);
        }
      }
    };
    loadMarket();
    const interval = setInterval(loadMarket, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedGrant?.stock_ticker, selectedGrantId, vestingLoading]);

  const openGrantModal = () => {
    setGrantForm(buildGrantForm(today));
    setGrantError("");
    setGrantModalOpen(true);
  };

  const closeGrantModal = () => {
    if (grantSaving) {
      return;
    }
    setGrantModalOpen(false);
    setGrantForm(buildGrantForm(today));
    setGrantError("");
  };

  const openAddPeriodModal = () => {
    if (!selectedGrantId) {
      return;
    }
    setAddPeriodForm(buildVestingPeriodForm(today));
    setAddPeriodError("");
    setAddPeriodModalOpen(true);
  };

  const closeAddPeriodModal = () => {
    if (addPeriodSaving) {
      return;
    }
    setAddPeriodModalOpen(false);
    setAddPeriodForm(buildVestingPeriodForm(today));
    setAddPeriodError("");
  };

  const openVestModal = (period) => {
    setVestTarget(period);
    setVestForm(buildVestForm(period.vest_date || today));
    setVestError("");
    setVestModalOpen(true);
  };

  const closeVestModal = () => {
    if (vestSaving) {
      return;
    }
    setVestModalOpen(false);
    setVestTarget(null);
    setVestForm(buildVestForm(""));
    setVestError("");
  };

  const openSellModal = (period) => {
    setSellTarget(period);
    setSellForm(buildSellForm(today));
    setSellError("");
    setSellModalOpen(true);
  };

  const closeSellModal = () => {
    if (sellSaving) {
      return;
    }
    setSellModalOpen(false);
    setSellTarget(null);
    setSellForm(buildSellForm(""));
    setSellError("");
  };

  const handleGrantChange = (event) => {
    const { name, value } = event.target;
    setGrantForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddPeriodChange = (event) => {
    const { name, value } = event.target;
    setAddPeriodForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleVestChange = (event) => {
    const { name, value } = event.target;
    setVestForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSellChange = (event) => {
    const { name, value } = event.target;
    setSellForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGrantSubmit = async (event) => {
    event.preventDefault();
    const name = grantForm.name.trim();
    const ticker = grantForm.stock_ticker.trim().toUpperCase();
    if (!name) {
      setGrantError("Enter a grant name.");
      return;
    }
    if (!ticker) {
      setGrantError("Enter a stock ticker.");
      return;
    }
    if (!grantForm.grant_date) {
      setGrantError("Select a grant date.");
      return;
    }

    setGrantSaving(true);
    setGrantError("");
    try {
      const response = await fetch("/api/rsu-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          stock_ticker: ticker,
          stock_currency: grantForm.stock_currency,
          grant_date: grantForm.grant_date
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to create RSU grant.");
      }
      setGrants((prev) => [data, ...prev]);
      setSelectedGrantId(String(data.id));
      closeGrantModal();
    } catch (err) {
      setGrantError(err.message);
    } finally {
      setGrantSaving(false);
    }
  };

  const handleAddPeriodSubmit = async (event) => {
    event.preventDefault();
    if (!selectedGrantId) {
      return;
    }
    if (!addPeriodForm.vest_date) {
      setAddPeriodError("Select a vest date.");
      return;
    }
    const quantityValue = Number(addPeriodForm.granted_quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setAddPeriodError("Enter a valid granted quantity.");
      return;
    }

    setAddPeriodSaving(true);
    setAddPeriodError("");
    try {
      const response = await fetch(
        `/api/rsu-grants/${selectedGrantId}/vesting-periods`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vest_date: addPeriodForm.vest_date,
            granted_quantity: quantityValue
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to create vesting period.");
      }
      closeAddPeriodModal();
      await loadVestingPeriods(selectedGrantId);
    } catch (err) {
      setAddPeriodError(err.message);
    } finally {
      setAddPeriodSaving(false);
    }
  };

  const handleVestSubmit = async (event) => {
    event.preventDefault();
    if (!vestTarget || !selectedGrantId) {
      return;
    }
    if (!vestForm.vest_date) {
      setVestError("Select a vest date.");
      return;
    }
    const priceValue = Number(vestForm.price_at_vesting);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setVestError("Enter a valid vest price.");
      return;
    }
    if (investmentAccounts.length > 1 && !vestForm.account_id) {
      setVestError("Select an account.");
      return;
    }

    setVestSaving(true);
    setVestError("");
    try {
      const response = await fetch(
        `/api/rsu-grants/${selectedGrantId}/vesting-periods/${vestTarget.id}/vest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vest_date: vestForm.vest_date,
            price_at_vesting: priceValue,
            account_id: vestForm.account_id
              ? Number(vestForm.account_id)
              : null
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to record vesting.");
      }
      closeVestModal();
      await loadVestingPeriods(selectedGrantId);
      await loadRsuValuation(selectedGrantId);
    } catch (err) {
      setVestError(err.message);
    } finally {
      setVestSaving(false);
    }
  };

  const handleSellSubmit = async (event) => {
    event.preventDefault();
    if (!sellTarget || !selectedGrantId) {
      return;
    }
    const quantityValue = Number(sellForm.quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setSellError("Enter a valid quantity.");
      return;
    }
    const sharesAvailable = Number(
      sellTarget.shares_available ?? sellTarget.shares_left ?? 0
    );
    if (sharesAvailable && quantityValue > sharesAvailable) {
      setSellError("Quantity exceeds available shares.");
      return;
    }
    const priceValue = Number(sellForm.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setSellError("Enter a valid sell price.");
      return;
    }
    if (!sellForm.sell_date) {
      setSellError("Select a sell date.");
      return;
    }
    if (investmentAccounts.length > 1 && !sellForm.account_id) {
      setSellError("Select an account.");
      return;
    }

    setSellSaving(true);
    setSellError("");
    try {
      const response = await fetch(
        `/api/rsu-grants/${selectedGrantId}/vesting-periods/${sellTarget.id}/sell`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: quantityValue,
            price: priceValue,
            sell_date: sellForm.sell_date,
            account_id: sellForm.account_id
              ? Number(sellForm.account_id)
              : null
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to sell RSU shares.");
      }
      setVestingPeriods((prev) =>
        prev.map((period) =>
          period.id === sellTarget.id
            ? { ...period, shares_available: data.shares_remaining }
            : period
        )
      );
      await loadRsuValuation(selectedGrantId);
      closeSellModal();
    } catch (err) {
      setSellError(err.message);
    } finally {
      setSellSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-full px-4 py-10 sm:max-w-3xl">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">RSU</h1>
      <p className="mt-2 text-sm text-slate-500">
        Track grants, vesting batches, and RSU share sales.
      </p>

      <div className="mt-8 grid gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>RSU grants</CardTitle>
              <CardDescription>Select a grant to view its vesting schedule.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={openGrantModal}>
              New RSU grant
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            {grantsLoading ? <p>Loading RSU grants...</p> : null}
            {grantsError ? (
              <p className="text-sm text-rose-600">{grantsError}</p>
            ) : null}
            {!grantsLoading && grants.length === 0 ? (
              <p>No RSU grants yet.</p>
            ) : null}
            {!grantsLoading && grants.length > 0 ? (
              <div className="flex flex-wrap items-end gap-4 text-sm text-slate-600">
                <label className="min-w-[240px]">
                  Grant
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    value={selectedGrantId}
                    onChange={(event) => setSelectedGrantId(event.target.value)}
                  >
                    {grants.map((grant) => (
                      <option key={grant.id} value={grant.id}>
                        {grant.name} • {formatShortDate(grant.grant_date)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedGrant ? (
                  <div className="text-sm text-slate-500">
                    {selectedGrant.stock_ticker} ({selectedGrant.stock_currency})
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Vesting periods</CardTitle>
              <CardDescription>
                Mark vesting batches and record any share sales.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={openAddPeriodModal}
              disabled={!selectedGrantId}
            >
              Add vesting period
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto md:overflow-visible">
            {accountsError ? (
              <p className="text-sm text-rose-600">{accountsError}</p>
            ) : null}
            {vestingLoading ? <p>Loading vesting periods...</p> : null}
            {vestingError ? (
              <p className="text-sm text-rose-600">{vestingError}</p>
            ) : null}
            {!selectedGrantId && !vestingLoading ? (
              <p>Select a grant to view vesting periods.</p>
            ) : null}
            {selectedGrantId && !vestingLoading && vestingPeriods.length === 0 ? (
              <p>No vesting periods for this RSU grant yet.</p>
            ) : null}
            {selectedGrantId && vestingPeriods.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vest date</TableHead>
                    <TableHead className="text-right">Granted quantity</TableHead>
                    <TableHead>Status</TableHead>
                    {hasVestedPeriods ? (
                      <TableHead className="text-right">Shares available</TableHead>
                    ) : null}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vestingPeriods.map((period) => {
                    const sharesAvailable =
                      period.shares_available ?? period.shares_left;
                    const isVested = period.status === "vested";
                    const canSell =
                      isVested &&
                      Number(sharesAvailable ?? 0) > 0;
                    return (
                      <TableRow key={period.id}>
                        <TableCell>{formatShortDate(period.vest_date)}</TableCell>
                        <TableCell className="text-right">
                          {quantityFormatter.format(
                            Number(period.granted_quantity || 0)
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              isVested
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {isVested ? "Vested" : "Unvested"}
                          </span>
                        </TableCell>
                        {hasVestedPeriods ? (
                          <TableCell className="text-right">
                            {sharesAvailable == null
                              ? "-"
                              : quantityFormatter.format(Number(sharesAvailable))}
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {!isVested ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openVestModal(period)}
                              >
                                This batch vested
                              </Button>
                            ) : null}
                            {isVested ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openSellModal(period)}
                                disabled={!canSell}
                              >
                                Sell shares
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RSU valuation</CardTitle>
            <CardDescription>Live pricing refreshes every minute.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedGrantId ? (
              <p className="text-sm text-slate-500">
                Select a grant to view the valuation.
              </p>
            ) : (
              <>
                {rsuValuationLoading ? (
                  <p className="text-sm text-slate-500">
                    Loading RSU valuation...
                  </p>
                ) : null}
                {rsuMarketLoading ? (
                  <p className="text-sm text-slate-500">
                    Loading live price...
                  </p>
                ) : null}
                {rsuValuationError ? (
                  <p className="text-sm text-rose-600">{rsuValuationError}</p>
                ) : null}
                {rsuMarketError ? (
                  <p className="text-sm text-rose-600">{rsuMarketError}</p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">
                      Current price ({rsuStockCurrency || "currency"})
                    </div>
                    <div className="text-slate-900">
                      {rsuLiveMetrics?.livePrice != null
                        ? formatPrice(
                            rsuLiveMetrics.livePrice,
                            rsuStockCurrency
                          )
                        : "-"}
                    </div>
                  </div>
                  {hasUnvestedPeriods ? (
                    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                      <div className="text-xs text-slate-500">
                        Unvested / potential ({rsuStockCurrency || "currency"})
                      </div>
                      <div className="text-slate-900">
                        {rsuLiveMetrics?.potentialValue != null
                          ? formatMoney(
                              rsuLiveMetrics.potentialValue,
                              rsuStockCurrency
                            )
                          : "-"}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">
                      Unrealized value ({rsuStockCurrency || "currency"})
                    </div>
                    <div className="text-slate-900">
                      {!hasVestedPeriods ? (
                        <span className="text-slate-400">
                          No vested batches yet.
                        </span>
                      ) : rsuLiveMetrics?.unrealizedValue != null ? (
                        formatMoney(
                          rsuLiveMetrics.unrealizedValue,
                          rsuStockCurrency
                        )
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">
                      Realized value ({rsuStockCurrency || "currency"})
                    </div>
                    <div className="text-slate-900">
                      {!hasVestedPeriods ? (
                        <span className="text-slate-400">
                          No vested batches yet.
                        </span>
                      ) : rsuLiveMetrics?.realizedValue != null ? (
                        formatMoney(
                          rsuLiveMetrics.realizedValue,
                          rsuStockCurrency
                        )
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">
                      Total value ({rsuStockCurrency || "currency"})
                    </div>
                    <div className="text-slate-900">
                      {!hasVestedPeriods ? (
                        <span className="text-slate-400">
                          No vested batches yet.
                        </span>
                      ) : rsuLiveMetrics?.totalValue != null ? (
                        formatMoney(
                          rsuLiveMetrics.totalValue,
                          rsuStockCurrency
                        )
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                </div>
                {rsuMarketLoading ? (
                  <p className="mt-3 text-xs text-slate-400">
                    Fetching live market data...
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={grantModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeGrantModal();
          } else {
            setGrantModalOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Create RSU grant</DialogTitle>
            <DialogDescription>
              Add the grant metadata before tracking vesting periods.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGrantSubmit} className="grid gap-3">
            <label className="text-sm text-slate-600">
              Grant name
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="name"
                value={grantForm.name}
                onChange={handleGrantChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Stock ticker
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="stock_ticker"
                value={grantForm.stock_ticker}
                onChange={handleGrantChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Stock currency
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="stock_currency"
                value={grantForm.stock_currency}
                onChange={handleGrantChange}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Grant date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="date"
                name="grant_date"
                value={grantForm.grant_date}
                onChange={handleGrantChange}
                required
              />
            </label>
            {grantError ? (
              <p className="text-sm text-rose-600">{grantError}</p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeGrantModal}
                  disabled={grantSaving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={grantSaving}>
                {grantSaving ? "Saving..." : "Create grant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addPeriodModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeAddPeriodModal();
          } else {
            setAddPeriodModalOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add vesting period</DialogTitle>
            <DialogDescription>
              Add a vest date and granted quantity for this grant.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPeriodSubmit} className="grid gap-3">
            <label className="text-sm text-slate-600">
              Vest date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="date"
                name="vest_date"
                value={addPeriodForm.vest_date}
                onChange={handleAddPeriodChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Granted quantity
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="number"
                step="0.0001"
                min="0"
                name="granted_quantity"
                value={addPeriodForm.granted_quantity}
                onChange={handleAddPeriodChange}
                required
              />
            </label>
            {addPeriodError ? (
              <p className="text-sm text-rose-600">{addPeriodError}</p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeAddPeriodModal}
                  disabled={addPeriodSaving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={addPeriodSaving}>
                {addPeriodSaving ? "Saving..." : "Add vesting period"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={vestModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeVestModal();
          } else {
            setVestModalOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>This batch vested</DialogTitle>
            <DialogDescription>
              Confirm the vest date and price per share.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVestSubmit} className="grid gap-3">
            <label className="text-sm text-slate-600">
              Vest date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="date"
                name="vest_date"
                value={vestForm.vest_date}
                onChange={handleVestChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Price at vesting
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="number"
                step="0.0001"
                min="0"
                name="price_at_vesting"
                value={vestForm.price_at_vesting}
                onChange={handleVestChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Investment account
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="account_id"
                value={vestForm.account_id}
                onChange={handleVestChange}
              >
                <option value="">Select account</option>
                {investmentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            {vestError ? (
              <p className="text-sm text-rose-600">{vestError}</p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeVestModal}
                  disabled={vestSaving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={vestSaving}>
                {vestSaving ? "Saving..." : "Confirm vest"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sellModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeSellModal();
          } else {
            setSellModalOpen(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Sell RSU shares</DialogTitle>
            <DialogDescription>
              Record a sale from the selected vesting batch.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSellSubmit} className="grid gap-3">
            <label className="text-sm text-slate-600">
              Quantity
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="number"
                step="0.0001"
                min="0"
                name="quantity"
                value={sellForm.quantity}
                onChange={handleSellChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Sell price per share
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="number"
                step="0.0001"
                min="0"
                name="price"
                value={sellForm.price}
                onChange={handleSellChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Sell date
              <input
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                type="date"
                name="sell_date"
                value={sellForm.sell_date}
                onChange={handleSellChange}
                required
              />
            </label>
            <label className="text-sm text-slate-600">
              Investment account
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                name="account_id"
                value={sellForm.account_id}
                onChange={handleSellChange}
              >
                <option value="">Select account</option>
                {investmentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            {sellError ? (
              <p className="text-sm text-rose-600">{sellError}</p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeSellModal}
                  disabled={sellSaving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={sellSaving}>
                {sellSaving ? "Saving..." : "Record sell"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

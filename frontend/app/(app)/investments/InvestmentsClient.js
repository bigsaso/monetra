"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import RealizedInvestmentsCard from "../../components/RealizedInvestmentsCard";
import TransactionDetailModal from "../../components/TransactionDetailModal";
import { CURRENCY_OPTIONS } from "../../../lib/currencies";

const emptyForm = { name: "", symbol: "", asset_type: "stock" };

const assetTypeOptions = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "mutual_fund", label: "Mutual fund" },
  { value: "crypto", label: "Crypto" },
  { value: "bond", label: "Bond" },
  { value: "cash", label: "Cash" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" }
];

const ESPP_CLOSED_STORAGE_KEY = "monetra.esppClosedSummaries";

const normalizeCurrencyValue = (value) =>
  String(value || "").trim().toUpperCase();

const isForeignCurrency = (currency, homeCurrency) => {
  const normalizedCurrency = normalizeCurrencyValue(currency);
  const normalizedHome = normalizeCurrencyValue(homeCurrency);
  if (!normalizedCurrency || !normalizedHome) {
    return false;
  }
  return normalizedCurrency !== normalizedHome;
};

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

const getCurrencyLabel = (currency) => {
  const normalizedCurrency = normalizeCurrencyValue(currency);
  if (!normalizedCurrency) {
    return "Select currency";
  }
  const match = CURRENCY_OPTIONS.find(
    (option) => option.value === normalizedCurrency
  );
  return match ? match.label : normalizedCurrency;
};

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

const parseNumberInput = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumberInput = (value) =>
  value === null || value === undefined ? "" : String(value);

const buildEsppSchedule = (startDate) => {
  const base = parseDateValue(startDate);
  if (!base || Number.isNaN(base.getTime())) {
    return [];
  }
  return Array.from({ length: 13 }, (_, index) => {
    const next = new Date(base);
    next.setDate(base.getDate() + index * 14);
    return formatDateInput(next);
  });
};

const buildEmptySellForm = (dateValue) => ({
  account_id: "",
  amount: "",
  currency: "",
  type: "income",
  category: "",
  date: dateValue,
  notes: "",
  investment_id: "",
  quantity: "",
  price: "",
  investment_type: "sell"
});

const buildEmptyEsppSellForm = (dateValue) => ({
  account_id: "",
  batch_id: "",
  quantity: "",
  price: "",
  date: dateValue,
  currency: ""
});

export default function InvestmentsClient({ view = "investments" }) {
  const isEsppView = view === "espp";
  const [positions, setPositions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [homeCurrency, setHomeCurrency] = useState("USD");
  const [esppPeriods, setEsppPeriods] = useState([]);
  const [esppPeriodsLoading, setEsppPeriodsLoading] = useState(true);
  const [esppPeriodsError, setEsppPeriodsError] = useState("");
  const [selectedEsppPeriodId, setSelectedEsppPeriodId] = useState("");
  const [esppDeposits, setEsppDeposits] = useState([]);
  const [esppDepositsLoading, setEsppDepositsLoading] = useState(false);
  const [esppDepositsError, setEsppDepositsError] = useState("");
  const [esppModalOpen, setEsppModalOpen] = useState(false);
  const [esppForm, setEsppForm] = useState({
    name: "",
    start_date: "",
    stock_ticker: "",
    stock_currency: "USD"
  });
  const [esppFormError, setEsppFormError] = useState("");
  const [esppSaving, setEsppSaving] = useState(false);
  const [esppDepositSaving, setEsppDepositSaving] = useState({});
  const [esppSummaryInputs, setEsppSummaryInputs] = useState({});
  const [esppSummary, setEsppSummary] = useState({});
  const [esppSummaryLoading, setEsppSummaryLoading] = useState(false);
  const [esppSummaryError, setEsppSummaryError] = useState("");
  const [esppClosedSummaries, setEsppClosedSummaries] = useState({});
  const [esppBatchValuations, setEsppBatchValuations] = useState({});
  const [esppBatchValuationLoading, setEsppBatchValuationLoading] =
    useState(false);
  const [esppBatchValuationError, setEsppBatchValuationError] = useState("");
  const [esppClosureLoading, setEsppClosureLoading] = useState(false);
  const [esppClosureError, setEsppClosureError] = useState("");
  const [esppCloseModalOpen, setEsppCloseModalOpen] = useState(false);
  const [esppCloseForm, setEsppCloseForm] = useState({
    account_id: "",
    open_fmv: "",
    close_fmv: "",
    exchange_rate: ""
  });
  const [esppCloseSummary, setEsppCloseSummary] = useState(null);
  const [esppCloseLoading, setEsppCloseLoading] = useState(false);
  const [esppCloseError, setEsppCloseError] = useState("");
  const [esppCloseSaving, setEsppCloseSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [realized, setRealized] = useState([]);
  const [realizedLoading, setRealizedLoading] = useState(true);
  const [realizedError, setRealizedError] = useState("");
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertDate, setConvertDate] = useState("");
  const [convertError, setConvertError] = useState("");
  const [convertSaving, setConvertSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [activityInvestmentFilter, setActivityInvestmentFilter] = useState("all");
  const [activityRowsPerPage, setActivityRowsPerPage] = useState(10);
  const [activityPage, setActivityPage] = useState(1);
  const [accounts, setAccounts] = useState([]);
  const [accountsError, setAccountsError] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState(null);
  const [sellForm, setSellForm] = useState(buildEmptySellForm(""));
  const [sellError, setSellError] = useState("");
  const [sellSaving, setSellSaving] = useState(false);
  const [esppBatches, setEsppBatches] = useState([]);
  const [esppBatchesLoading, setEsppBatchesLoading] = useState(false);
  const [esppBatchesError, setEsppBatchesError] = useState("");
  const [esppSellModalOpen, setEsppSellModalOpen] = useState(false);
  const [esppSellForm, setEsppSellForm] = useState(buildEmptyEsppSellForm(""));
  const [esppSellError, setEsppSellError] = useState("");
  const [esppSellSaving, setEsppSellSaving] = useState(false);
  const [transactionLookup, setTransactionLookup] = useState(null);
  const [transactionLookupLoading, setTransactionLookupLoading] = useState(false);
  const [transactionLookupError, setTransactionLookupError] = useState("");
  const [esppMarketQuote, setEsppMarketQuote] = useState(null);
  const [esppMarketLoading, setEsppMarketLoading] = useState(false);
  const [esppMarketError, setEsppMarketError] = useState("");
  const [esppFxRate, setEsppFxRate] = useState(null);
  const [esppFxLoading, setEsppFxLoading] = useState(false);
  const [esppFxError, setEsppFxError] = useState("");
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [selectedTransactionFallback, setSelectedTransactionFallback] = useState(null);
  const [selectedTransactionInvestment, setSelectedTransactionInvestment] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const esppSaveTimers = useRef({});
  const esppSummaryTimer = useRef(null);
  const esppOpenFmvSaveTimer = useRef(null);
  const esppCloseSummaryTimer = useRef(null);
  const esppRefreshRef = useRef(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    []
  );

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
    []
  );

  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
      }),
    []
  );

  const activityInvestmentOptions = useMemo(() => {
    const lookup = new Map();
    activity.forEach((entry) => {
      if (entry?.investment_id == null) {
        return;
      }
      const key = String(entry.investment_id);
      if (!lookup.has(key)) {
        lookup.set(key, {
          id: key,
          name: entry.investment_name || "Unknown investment",
          symbol: entry.investment_symbol || ""
        });
      }
    });
    return Array.from(lookup.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [activity]);

  const selectedEsppPeriod = useMemo(
    () =>
      esppPeriods.find(
        (period) => String(period.id) === String(selectedEsppPeriodId)
      ),
    [esppPeriods, selectedEsppPeriodId]
  );

  const selectedEsppBatch = useMemo(
    () =>
      esppBatches.find(
        (batch) => String(batch.period_id) === String(esppSellForm.batch_id)
      ),
    [esppBatches, esppSellForm.batch_id]
  );

  const esppSellCurrencyOptions = useMemo(() => {
    if (!selectedEsppBatch?.stock_currency) {
      return CURRENCY_OPTIONS.filter((option) => option.value);
    }
    const match = CURRENCY_OPTIONS.find(
      (option) => option.value === selectedEsppBatch.stock_currency
    );
    return match
      ? [match]
      : [
          {
            value: selectedEsppBatch.stock_currency,
            label: getCurrencyLabel(selectedEsppBatch.stock_currency)
          }
        ];
  }, [selectedEsppBatch?.stock_currency]);

  const esppSchedule = useMemo(
    () => buildEsppSchedule(selectedEsppPeriod?.start_date),
    [selectedEsppPeriod?.start_date]
  );

  const esppDepositRows = useMemo(() => {
    if (!selectedEsppPeriod) {
      return [];
    }
    const lookup = new Map(
      esppDeposits.map((deposit) => [deposit.date, deposit])
    );
    return esppSchedule.map((dateValue) => {
      const match = lookup.get(dateValue);
      if (match) {
        return match;
      }
      return {
        id: null,
        date: dateValue,
        amount_home_currency: "",
        amount_input: ""
      };
    });
  }, [esppDeposits, esppSchedule, selectedEsppPeriod]);

  const esppSummaryInputsForPeriod = useMemo(() => {
    const defaults = { open_fmv: "", close_fmv: "", exchange_rate: "" };
    if (!selectedEsppPeriodId) {
      return defaults;
    }
    return {
      ...defaults,
      ...(esppSummaryInputs[selectedEsppPeriodId] || {})
    };
  }, [esppSummaryInputs, selectedEsppPeriodId]);

  const esppSummaryData = useMemo(() => {
    if (!selectedEsppPeriodId) {
      return null;
    }
    return esppSummary[selectedEsppPeriodId] || null;
  }, [esppSummary, selectedEsppPeriodId]);

  const esppSummaryOpenFmvInput =
    esppSummaryInputsForPeriod.open_fmv !== ""
      ? esppSummaryInputsForPeriod.open_fmv
      : formatNumberInput(esppSummaryData?.open_fmv);

  const esppCloseSummaryData = useMemo(
    () => esppCloseSummary || esppSummaryData,
    [esppCloseSummary, esppSummaryData]
  );

  const esppPostCloseSummary = useMemo(() => {
    if (!selectedEsppPeriodId || selectedEsppPeriod?.status !== "closed") {
      return null;
    }
    return esppClosedSummaries[selectedEsppPeriodId] || esppSummaryData || null;
  }, [
    esppClosedSummaries,
    esppSummaryData,
    selectedEsppPeriod?.status,
    selectedEsppPeriodId
  ]);

  const esppLiveMetrics = useMemo(() => {
    if (!esppPostCloseSummary) {
      return null;
    }
    const sharesLeft = Number(esppPostCloseSummary.shares_left || 0);
    const batchValuation = esppBatchValuations[selectedEsppPeriodId] || null;
    const realizedValue =
      batchValuation?.realized_value != null
        ? Number(batchValuation.realized_value)
        : null;
    const remainingShares =
      batchValuation?.remaining_shares != null
        ? Number(batchValuation.remaining_shares)
        : sharesLeft;
    const normalizedRemainingShares = Number.isFinite(remainingShares)
      ? remainingShares
      : sharesLeft;
    const closeFmv = Number(esppPostCloseSummary.close_fmv || 0);
    const totalInvestedHome = Number(esppPostCloseSummary.total_invested_home || 0);
    const livePrice = Number(esppMarketQuote?.price || 0);
    if (!Number.isFinite(livePrice) || livePrice <= 0) {
      return {
        sharesLeft,
        remainingShares: normalizedRemainingShares,
        closeFmv,
        realizedValue,
        totalInvestedHome,
        livePrice: null,
        unrealizedValue: null,
        totalEsppValue: null,
        estimatedTaxes: null,
        canSellValue: null,
        canSellHome: null,
        totalEsppHome: null,
        profitLoss: null,
        profitLossPercent: null
      };
    }
    const unrealizedValue = normalizedRemainingShares * livePrice;
    const totalEsppValue =
      realizedValue != null ? realizedValue + unrealizedValue : null;
    const hasCloseFmv = Number.isFinite(closeFmv) && closeFmv > 0;
    const priceDelta = hasCloseFmv ? Math.abs(closeFmv - livePrice) : null;
    const estimatedTaxes =
      hasCloseFmv ? normalizedRemainingShares * (priceDelta * 0.5) * 0.47 : null;
    const canSellValue =
      estimatedTaxes != null ? unrealizedValue - estimatedTaxes : null;
    const fxRate =
      esppFxRate && Number.isFinite(Number(esppFxRate))
        ? Number(esppFxRate)
        : null;
    const canSellHome =
      fxRate && Number.isFinite(fxRate) && canSellValue != null
        ? canSellValue * fxRate
        : null;
    const totalEsppHome =
      fxRate && Number.isFinite(fxRate) && totalEsppValue != null
        ? totalEsppValue * fxRate
        : null;
    const profitLoss =
      totalEsppHome !== null && Number.isFinite(totalInvestedHome)
        ? totalEsppHome - totalInvestedHome
        : null;
    const profitLossPercent =
      profitLoss !== null && totalInvestedHome > 0
        ? profitLoss / totalInvestedHome
        : null;
    return {
      sharesLeft,
      remainingShares: normalizedRemainingShares,
      closeFmv,
      realizedValue,
      totalInvestedHome,
      livePrice,
      unrealizedValue,
      totalEsppValue,
      estimatedTaxes,
      canSellValue,
      canSellHome,
      totalEsppHome,
      profitLoss,
      profitLossPercent
    };
  }, [
    esppBatchValuations,
    esppFxRate,
    esppMarketQuote,
    esppPostCloseSummary,
    selectedEsppPeriodId
  ]);

  const filteredActivity = useMemo(() => {
    if (activityInvestmentFilter === "all") {
      return activity;
    }
    return activity.filter(
      (entry) => String(entry.investment_id) === activityInvestmentFilter
    );
  }, [activity, activityInvestmentFilter]);

  const totalActivityPages = Math.max(
    1,
    Math.ceil(filteredActivity.length / activityRowsPerPage)
  );

  const pagedActivity = useMemo(() => {
    const start = (activityPage - 1) * activityRowsPerPage;
    return filteredActivity.slice(start, start + activityRowsPerPage);
  }, [activityPage, activityRowsPerPage, filteredActivity]);

  const loadPositions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/investments/positions");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investment positions.");
      }
      const data = await response.json();
      setPositions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const response = await fetch("/api/investments/activity");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load investment activity.");
      }
      const data = await response.json();
      setActivity(data);
    } catch (err) {
      setActivityError(err.message);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadRealized = async () => {
    setRealizedLoading(true);
    setRealizedError("");
    try {
      const response = await fetch("/api/investments/realized");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load realized investments.");
      }
      const data = await response.json();
      setRealized(data);
    } catch (err) {
      setRealizedError(err.message);
    } finally {
      setRealizedLoading(false);
    }
  };

  const loadAccounts = async () => {
    setAccountsError("");
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load accounts.");
      }
      const data = await response.json();
      setAccounts(data);
    } catch (err) {
      setAccountsError(err.message);
    }
  };

  const loadCategories = async () => {
    setCategoriesError("");
    try {
      const response = await fetch("/api/categories");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load categories.");
      }
      const data = await response.json();
      setCategories(data);
    } catch (err) {
      setCategoriesError(err.message);
    }
  };

  const loadHomeCurrency = async () => {
    try {
      const response = await fetch("/api/user-settings");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load user settings.");
      }
      const data = await response.json();
      const resolved = String(data?.home_currency || "").trim().toUpperCase();
      if (resolved) {
        setHomeCurrency(resolved);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const buildEsppFormDefaults = (currency, startDate) => ({
    name: "",
    start_date: startDate || today,
    stock_ticker: "",
    stock_currency: currency || "USD"
  });

  const buildEsppCloseDefaults = () => ({
    account_id: "",
    open_fmv:
      esppSummaryInputsForPeriod.open_fmv ||
      formatNumberInput(esppSummaryData?.open_fmv),
    close_fmv:
      esppSummaryInputsForPeriod.close_fmv ||
      formatNumberInput(esppSummaryData?.close_fmv),
    exchange_rate:
      esppSummaryInputsForPeriod.exchange_rate ||
      formatNumberInput(esppSummaryData?.exchange_rate)
  });

  const loadEsppPeriods = async (preferredPeriodId = "") => {
    setEsppPeriodsLoading(true);
    setEsppPeriodsError("");
    try {
      const response = await fetch("/api/espp-periods");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP periods.");
      }
      const data = await response.json();
      setEsppPeriods(data);
      const candidateId = preferredPeriodId || selectedEsppPeriodId;
      const hasCandidate = data.some(
        (period) => String(period.id) === String(candidateId)
      );
      const nextId = hasCandidate
        ? String(candidateId)
        : data.length > 0
          ? String(data[0].id)
          : "";
      setSelectedEsppPeriodId(nextId);
    } catch (err) {
      setEsppPeriodsError(err.message);
    } finally {
      setEsppPeriodsLoading(false);
    }
  };

  const loadEsppBatches = async (preferredBatchId = "") => {
    setEsppBatchesLoading(true);
    setEsppBatchesError("");
    try {
      const response = await fetch("/api/espp-batches");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP batches.");
      }
      const data = await response.json();
      setEsppBatches(data);
      const candidateId = preferredBatchId || esppSellForm.batch_id;
      const hasCandidate = data.some(
        (batch) => String(batch.period_id) === String(candidateId)
      );
      const nextId = hasCandidate
        ? String(candidateId)
        : data.length > 0
          ? String(data[0].period_id)
          : "";
      setEsppSellForm((prev) => ({
        ...prev,
        batch_id: nextId
      }));
    } catch (err) {
      setEsppBatchesError(err.message);
    } finally {
      setEsppBatchesLoading(false);
    }
  };

  const loadEsppDeposits = async (periodId) => {
    if (!periodId) {
      setEsppDeposits([]);
      return;
    }
    setEsppDepositsLoading(true);
    setEsppDepositsError("");
    try {
      const response = await fetch(`/api/espp-periods/${periodId}/deposits`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP deposits.");
      }
      const data = await response.json();
      setEsppDeposits(
        data.map((deposit) => ({
          ...deposit,
          amount_input:
            deposit.amount_home_currency === null ||
            deposit.amount_home_currency === undefined
              ? ""
              : String(deposit.amount_home_currency)
        }))
      );
    } catch (err) {
      setEsppDepositsError(err.message);
    } finally {
      setEsppDepositsLoading(false);
    }
  };

  const loadEsppSummary = async (periodId, inputs) => {
    if (!periodId) {
      return;
    }
    setEsppSummaryLoading(true);
    setEsppSummaryError("");
    try {
      const payload = {
        open_fmv: parseNumberInput(inputs.open_fmv),
        close_fmv: parseNumberInput(inputs.close_fmv),
        exchange_rate: parseNumberInput(inputs.exchange_rate)
      };
      const response = await fetch(`/api/espp-periods/${periodId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP summary.");
      }
      const data = await response.json();
      setEsppSummary((prev) => ({ ...prev, [periodId]: data }));
    } catch (err) {
      setEsppSummaryError(err.message);
    } finally {
      setEsppSummaryLoading(false);
    }
  };

  const loadEsppClosureSummary = async (periodId) => {
    if (!periodId) {
      return;
    }
    setEsppClosureLoading(true);
    setEsppClosureError("");
    try {
      const response = await fetch(`/api/espp-periods/${periodId}/closure`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP close summary.");
      }
      const data = await response.json();
      setEsppClosedSummaries((prev) => {
        const next = { ...prev, [periodId]: data };
        persistEsppClosedSummaries(next);
        return next;
      });
    } catch (err) {
      setEsppClosureError(err.message);
    } finally {
      setEsppClosureLoading(false);
    }
  };

  const loadEsppBatchValuation = async (periodId) => {
    if (!periodId) {
      return;
    }
    setEsppBatchValuationLoading(true);
    setEsppBatchValuationError("");
    try {
      const response = await fetch(`/api/espp-batches/${periodId}/valuation`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP batch valuation.");
      }
      const data = await response.json();
      setEsppBatchValuations((prev) => ({ ...prev, [periodId]: data }));
    } catch (err) {
      setEsppBatchValuationError(err.message);
    } finally {
      setEsppBatchValuationLoading(false);
    }
  };

  const loadEsppCloseSummary = async (periodId, inputs) => {
    if (!periodId) {
      return;
    }
    setEsppCloseLoading(true);
    setEsppCloseError("");
    try {
      const payload = {
        open_fmv: parseNumberInput(inputs.open_fmv),
        close_fmv: parseNumberInput(inputs.close_fmv),
        exchange_rate: parseNumberInput(inputs.exchange_rate)
      };
      const response = await fetch(`/api/espp-periods/${periodId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load ESPP summary.");
      }
      const data = await response.json();
      setEsppCloseSummary(data);
    } catch (err) {
      setEsppCloseError(err.message);
    } finally {
      setEsppCloseLoading(false);
    }
  };

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(ESPP_CLOSED_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        setEsppClosedSummaries(parsed);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [isEsppView]);

  useEffect(() => {
    loadHomeCurrency();
    if (isEsppView) {
      loadEsppPeriods();
      loadEsppBatches();
      return;
    }
    loadPositions();
    loadActivity();
    loadRealized();
  }, [isEsppView]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!selectedEsppPeriodId) {
      setEsppDeposits([]);
      return;
    }
    loadEsppDeposits(selectedEsppPeriodId);
  }, [isEsppView, selectedEsppPeriodId]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!selectedEsppPeriodId || selectedEsppPeriod?.status !== "open") {
      return;
    }
    if (esppSummaryTimer.current) {
      clearTimeout(esppSummaryTimer.current);
    }
    esppSummaryTimer.current = setTimeout(() => {
      loadEsppSummary(selectedEsppPeriodId, esppSummaryInputsForPeriod);
    }, 300);
    return () => {
      if (esppSummaryTimer.current) {
        clearTimeout(esppSummaryTimer.current);
      }
    };
  }, [
    isEsppView,
    selectedEsppPeriodId,
    selectedEsppPeriod?.status,
    esppSummaryInputsForPeriod,
    esppDeposits
  ]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (
      !esppCloseModalOpen ||
      !selectedEsppPeriodId ||
      selectedEsppPeriod?.status !== "open"
    ) {
      return;
    }
    if (esppCloseSummaryTimer.current) {
      clearTimeout(esppCloseSummaryTimer.current);
    }
    esppCloseSummaryTimer.current = setTimeout(() => {
      loadEsppCloseSummary(selectedEsppPeriodId, esppCloseForm);
    }, 300);
    return () => {
      if (esppCloseSummaryTimer.current) {
        clearTimeout(esppCloseSummaryTimer.current);
      }
    };
  }, [
    isEsppView,
    esppCloseModalOpen,
    selectedEsppPeriodId,
    selectedEsppPeriod?.status,
    esppCloseForm
  ]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!selectedEsppPeriodId || selectedEsppPeriod?.status !== "closed") {
      setEsppClosureLoading(false);
      setEsppClosureError("");
      return;
    }
    if (esppClosedSummaries[selectedEsppPeriodId]) {
      return;
    }
    loadEsppClosureSummary(selectedEsppPeriodId);
  }, [
    isEsppView,
    selectedEsppPeriodId,
    selectedEsppPeriod?.status,
    esppClosedSummaries
  ]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!selectedEsppPeriodId || selectedEsppPeriod?.status !== "closed") {
      setEsppBatchValuationLoading(false);
      setEsppBatchValuationError("");
      return;
    }
    loadEsppBatchValuation(selectedEsppPeriodId);
  }, [isEsppView, selectedEsppPeriodId, selectedEsppPeriod?.status]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!selectedEsppPeriodId || selectedEsppPeriod?.status !== "closed") {
      setEsppMarketQuote(null);
      setEsppFxRate(null);
      setEsppMarketError("");
      setEsppFxError("");
      setEsppMarketLoading(false);
      setEsppFxLoading(false);
      return;
    }
    const ticker = selectedEsppPeriod?.stock_ticker?.trim();
    const stockCurrency = normalizeCurrencyValue(selectedEsppPeriod?.stock_currency);
    const targetCurrency = normalizeCurrencyValue(homeCurrency);
    if (!ticker) {
      setEsppMarketError("Stock ticker required for live pricing.");
      setEsppMarketLoading(false);
      setEsppFxLoading(false);
      return;
    }
    let cancelled = false;
    const loadMarket = async () => {
      setEsppMarketLoading(true);
      setEsppFxLoading(true);
      setEsppMarketError("");
      setEsppFxError("");
      try {
        const quoteRequest = fetch(
          `/api/market/quote?symbol=${encodeURIComponent(ticker)}`
        );
        const fxRequest =
          !stockCurrency ||
          !targetCurrency ||
          stockCurrency === targetCurrency
            ? Promise.resolve({ rate: 1 })
            : fetch(
                `/api/market/fx?base=${encodeURIComponent(
                  stockCurrency
                )}&target=${encodeURIComponent(targetCurrency)}`
              );
        const [quoteResponse, fxResponse] = await Promise.all([
          quoteRequest,
          fxRequest
        ]);
        if (!cancelled) {
          if (quoteResponse?.ok) {
            const quoteData = await quoteResponse.json();
            setEsppMarketQuote(quoteData);
          } else {
            const quoteError = await quoteResponse.json();
            throw new Error(quoteError?.detail || "Failed to load live price.");
          }
          if (fxResponse?.rate === 1) {
            setEsppFxRate(1);
          } else if (fxResponse?.ok) {
            const fxData = await fxResponse.json();
            if (typeof fxData?.rate === "number") {
              setEsppFxRate(fxData.rate);
            } else {
              setEsppFxRate(null);
              setEsppFxError("Live FX rate unavailable.");
            }
          } else if (stockCurrency === targetCurrency) {
            setEsppFxRate(1);
          } else {
            setEsppFxRate(null);
            setEsppFxError("Live FX rate unavailable.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          const baseMessage =
            err.message || "Failed to load live market data.";
          const nextMessage = baseMessage.includes("Quote unavailable.")
            ? `${baseMessage} This could be caused by rate limiting. Retrying on next refresh.`
            : baseMessage;
          setEsppMarketError(nextMessage);
          setEsppMarketQuote(null);
          setEsppFxRate(null);
        }
      } finally {
        if (!cancelled) {
          setEsppMarketLoading(false);
          setEsppFxLoading(false);
        }
      }
    };
    loadMarket();
    esppRefreshRef.current = loadMarket;
    const interval = setInterval(loadMarket, 1800000);
    return () => {
      cancelled = true;
      if (esppRefreshRef.current === loadMarket) {
        esppRefreshRef.current = null;
      }
      clearInterval(interval);
    };
  }, [
    isEsppView,
    homeCurrency,
    selectedEsppPeriod?.status,
    selectedEsppPeriod?.stock_currency,
    selectedEsppPeriod?.stock_ticker,
    selectedEsppPeriodId
  ]);

  const handleEsppRefresh = () => {
    if (esppRefreshRef.current) {
      esppRefreshRef.current();
    }
  };

  useEffect(
    () => () => {
      Object.values(esppSaveTimers.current).forEach((timer) =>
        clearTimeout(timer)
      );
      if (esppSummaryTimer.current) {
        clearTimeout(esppSummaryTimer.current);
      }
      if (esppOpenFmvSaveTimer.current) {
        clearTimeout(esppOpenFmvSaveTimer.current);
      }
      if (esppCloseSummaryTimer.current) {
        clearTimeout(esppCloseSummaryTimer.current);
      }
    },
    []
  );

  const loadTransactionsLookup = async () => {
    if (transactionLookupLoading || transactionLookup !== null) {
      return;
    }
    setTransactionLookupLoading(true);
    setTransactionLookupError("");
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to load transactions.");
      }
      const data = await response.json();
      const lookup = data.reduce((acc, transaction) => {
        acc[transaction.id] = transaction;
        return acc;
      }, {});
      setTransactionLookup(lookup);
    } catch (err) {
      setTransactionLookupError(err.message);
    } finally {
      setTransactionLookupLoading(false);
    }
  };

  const openEsppModal = () => {
    setEsppForm(buildEsppFormDefaults(homeCurrency, today));
    setEsppFormError("");
    setEsppModalOpen(true);
  };

  const persistEsppClosedSummaries = (next) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(ESPP_CLOSED_STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  const openEsppCloseModal = () => {
    if (!selectedEsppPeriod || selectedEsppPeriod.status !== "open") {
      return;
    }
    setEsppCloseForm(buildEsppCloseDefaults());
    setEsppCloseSummary(esppSummaryData || null);
    setEsppCloseError("");
    setEsppCloseModalOpen(true);
  };

  const closeEsppCloseModal = () => {
    if (esppCloseSaving) {
      return;
    }
    setEsppCloseModalOpen(false);
    setEsppCloseError("");
    setEsppCloseSummary(null);
  };

  const handleEsppFormChange = (event) => {
    const { name, value } = event.target;
    setEsppForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEsppCreate = async (event) => {
    event.preventDefault();
    const name = esppForm.name.trim();
    const startDate = esppForm.start_date;
    const stockTicker = esppForm.stock_ticker.trim().toUpperCase();
    const stockCurrency = esppForm.stock_currency.trim().toUpperCase();
    if (!name) {
      setEsppFormError("Enter a period name.");
      return;
    }
    if (!startDate) {
      setEsppFormError("Select a start date.");
      return;
    }
    if (!stockTicker) {
      setEsppFormError("Enter a stock ticker.");
      return;
    }
    if (!stockCurrency) {
      setEsppFormError("Select a stock currency.");
      return;
    }
    setEsppSaving(true);
    setEsppFormError("");
    try {
      const response = await fetch("/api/espp-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          start_date: startDate,
          stock_ticker: stockTicker,
          stock_currency: stockCurrency
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to create ESPP period.");
      }
      setEsppModalOpen(false);
      await loadEsppPeriods(String(data.id));
    } catch (err) {
      setEsppFormError(err.message);
    } finally {
      setEsppSaving(false);
    }
  };

  const saveEsppDeposit = async (depositId, dateValue, amountValue) => {
    setEsppDepositSaving((prev) => ({ ...prev, [depositId]: true }));
    setEsppDepositsError("");
    try {
      const response = await fetch(`/api/espp-deposits/${depositId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateValue,
          amount_home_currency: amountValue
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to update ESPP deposit.");
      }
      setEsppDeposits((prev) =>
        prev.map((deposit) =>
          deposit.id === depositId
            ? {
                ...deposit,
                amount_home_currency: data.amount_home_currency,
                amount_input: String(data.amount_home_currency ?? "")
              }
            : deposit
        )
      );
    } catch (err) {
      setEsppDepositsError(err.message);
    } finally {
      setEsppDepositSaving((prev) => {
        const next = { ...prev };
        delete next[depositId];
        return next;
      });
    }
  };

  const saveEsppOpenFmv = async (periodId, openFmvValue) => {
    if (!periodId) {
      return;
    }
    setEsppSummaryError("");
    try {
      const response = await fetch(`/api/espp-periods/${periodId}/open-fmv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open_fmv: openFmvValue })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to save open FMV.");
      }
    } catch (err) {
      setEsppSummaryError(err.message);
    }
  };

  const handleEsppDepositChange = (depositId, dateValue, value) => {
    setEsppDeposits((prev) =>
      prev.map((deposit) =>
        deposit.id === depositId ? { ...deposit, amount_input: value } : deposit
      )
    );
    const normalizedAmount = value === "" ? "0" : value;
    const numericValue = Number(normalizedAmount);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return;
    }
    if (esppSaveTimers.current[depositId]) {
      clearTimeout(esppSaveTimers.current[depositId]);
    }
    esppSaveTimers.current[depositId] = setTimeout(() => {
      saveEsppDeposit(depositId, dateValue, normalizedAmount);
    }, 500);
  };

  const handleEsppSummaryInputChange = (event) => {
    const { name, value } = event.target;
    if (!selectedEsppPeriodId) {
      return;
    }
    setEsppSummaryInputs((prev) => ({
      ...prev,
      [selectedEsppPeriodId]: {
        ...prev[selectedEsppPeriodId],
        [name]: value
      }
    }));
    if (name !== "open_fmv" || selectedEsppPeriod?.status !== "open") {
      return;
    }
    if (esppOpenFmvSaveTimer.current) {
      clearTimeout(esppOpenFmvSaveTimer.current);
    }
    const normalizedValue = value === "" ? null : parseNumberInput(value);
    if (value !== "" && (normalizedValue === null || normalizedValue < 0)) {
      return;
    }
    esppOpenFmvSaveTimer.current = setTimeout(() => {
      saveEsppOpenFmv(selectedEsppPeriodId, normalizedValue);
    }, 500);
  };

  const handleEsppCloseInputChange = (event) => {
    const { name, value } = event.target;
    setEsppCloseForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEsppCloseSubmit = async (event) => {
    event.preventDefault();
    if (!selectedEsppPeriodId) {
      return;
    }
    if (!esppCloseForm.account_id) {
      setEsppCloseError("Select an account.");
      return;
    }
    const openFmv = parseNumberInput(esppCloseForm.open_fmv);
    if (!openFmv || openFmv <= 0) {
      setEsppCloseError("Enter a valid open FMV.");
      return;
    }
    const closeFmv = parseNumberInput(esppCloseForm.close_fmv);
    if (!closeFmv || closeFmv <= 0) {
      setEsppCloseError("Enter a valid close FMV.");
      return;
    }
    const exchangeRate = parseNumberInput(esppCloseForm.exchange_rate);
    if (!exchangeRate || exchangeRate <= 0) {
      setEsppCloseError("Enter a valid exchange rate.");
      return;
    }

    setEsppCloseSaving(true);
    setEsppCloseError("");
    try {
      const response = await fetch(
        `/api/espp-periods/${selectedEsppPeriodId}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: Number(esppCloseForm.account_id),
            open_fmv: openFmv,
            close_fmv: closeFmv,
            exchange_rate: exchangeRate
          })
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to close ESPP period.");
      }
      if (data?.summary) {
        setEsppSummary((prev) => ({
          ...prev,
          [selectedEsppPeriodId]: data.summary
        }));
        setEsppClosedSummaries((prev) => {
          const next = { ...prev, [selectedEsppPeriodId]: data.summary };
          persistEsppClosedSummaries(next);
          return next;
        });
      }
      await Promise.all([
        loadEsppPeriods(String(selectedEsppPeriodId)),
        loadEsppDeposits(selectedEsppPeriodId),
        loadEsppBatches(),
        loadPositions(),
        loadActivity(),
        loadRealized()
      ]);
      closeEsppCloseModal();
    } catch (err) {
      setEsppCloseError(err.message);
    } finally {
      setEsppCloseSaving(false);
    }
  };

  const buildInvestmentLabel = (name, symbol) => {
    if (!name) {
      return "";
    }
    return symbol ? `${name} (${symbol})` : name;
  };

  const isCloseEnough = (left, right) => {
    const leftValue = Number(left);
    const rightValue = Number(right);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return false;
    }
    return Math.abs(leftValue - rightValue) < 0.0001;
  };

  const findTransactionIdForRealized = (entry) => {
    const candidates = activity.filter(
      (item) =>
        item.type === "sell" &&
        item.investment_id === entry.investment_id &&
        item.date === entry.sell_date
    );
    if (candidates.length === 0) {
      return null;
    }
    if (candidates.length === 1) {
      return candidates[0].transaction_id;
    }
    const quantityMatches = candidates.filter((item) =>
      isCloseEnough(item.quantity, entry.quantity_sold)
    );
    if (quantityMatches.length === 1) {
      return quantityMatches[0].transaction_id;
    }
    const amountMatches = candidates.filter((item) =>
      isCloseEnough(item.total_amount, entry.total_proceeds)
    );
    if (amountMatches.length === 1) {
      return amountMatches[0].transaction_id;
    }
    return candidates[0].transaction_id;
  };

  const openTransactionModal = ({
    transactionId,
    fallback,
    investmentLabel
  }) => {
    setSelectedTransactionId(transactionId || null);
    setSelectedTransactionFallback(fallback || null);
    setSelectedTransactionInvestment(investmentLabel || "");
    setTransactionLookupError("");
    setTransactionModalOpen(true);
    if (transactionId || fallback?.investmentId) {
      loadTransactionsLookup();
    }
  };

  const closeTransactionModal = () => {
    setTransactionModalOpen(false);
    setSelectedTransactionId(null);
    setSelectedTransactionFallback(null);
    setSelectedTransactionInvestment("");
    setTransactionLookupError("");
  };

  const handleActivityTransactionOpen = (entry) => {
    openTransactionModal({
      transactionId: entry.transaction_id,
      fallback: {
        amount: entry.total_amount ?? entry.price,
        currency: entry.currency,
        date: entry.date,
        category: "",
        investmentId: entry.investment_id
      },
      investmentLabel: buildInvestmentLabel(
        entry.investment_name,
        entry.investment_symbol
      )
    });
  };

  const handleRealizedTransactionOpen = (entry) => {
    const transactionId = findTransactionIdForRealized(entry);
    openTransactionModal({
      transactionId,
      fallback: {
        amount: entry.total_proceeds,
        currency: entry.currency,
        date: entry.sell_date,
        category: "",
        investmentId: entry.investment_id
      },
      investmentLabel: buildInvestmentLabel(
        entry.investment_name,
        entry.investment_symbol
      )
    });
  };

  const handleTransactionRowKeyDown = (event, entry) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivityTransactionOpen(entry);
    }
  };

  const selectedTransaction = useMemo(() => {
    if (!transactionModalOpen) {
      return null;
    }
    const fallback = selectedTransactionFallback || {};
    let lookup =
      selectedTransactionId && transactionLookup
        ? transactionLookup[selectedTransactionId]
        : null;
    if (!lookup && transactionLookup && fallback.investmentId) {
      lookup = Object.values(transactionLookup).find(
        (transaction) =>
          transaction.investment_id === fallback.investmentId &&
          transaction.date === fallback.date &&
          isCloseEnough(transaction.amount, fallback.amount)
      );
    }
    return {
      amount: lookup?.amount ?? fallback.amount,
      currency: lookup?.currency ?? fallback.currency,
      date: lookup?.date ?? fallback.date,
      category: lookup?.category ?? fallback.category
    };
  }, [
    selectedTransactionFallback,
    selectedTransactionId,
    transactionLookup,
    transactionModalOpen
  ]);

  const resolveInvestmentCategory = () =>
    categories.find((category) => category.group === "investments");

  const openSellModal = (position) => {
    const investmentCategory = resolveInvestmentCategory();
    setSellTarget(position);
    setSellForm({
      ...buildEmptySellForm(today),
      investment_id: position?.id ? String(position.id) : "",
      currency: position?.currency || homeCurrency || "",
      category: investmentCategory?.name || ""
    });
    setSellError("");
    setSellModalOpen(true);
  };

  const closeSellModal = () => {
    if (sellSaving) {
      return;
    }
    setSellModalOpen(false);
    setSellTarget(null);
    setSellForm(buildEmptySellForm(today));
    setSellError("");
  };

  const openEsppSellModal = (batch) => {
    setEsppSellForm({
      ...buildEmptyEsppSellForm(today),
      batch_id: batch?.period_id ? String(batch.period_id) : "",
      currency: batch?.stock_currency || ""
    });
    setEsppSellError("");
    setEsppSellModalOpen(true);
  };

  const closeEsppSellModal = () => {
    if (esppSellSaving) {
      return;
    }
    setEsppSellModalOpen(false);
    setEsppSellForm(buildEmptyEsppSellForm(today));
    setEsppSellError("");
  };

  const handleSellChange = (event) => {
    const { name, value } = event.target;
    setSellForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEsppSellChange = (event) => {
    const { name, value } = event.target;
    setEsppSellForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSellSubmit = async (event) => {
    event.preventDefault();
    if (!sellForm.account_id) {
      setSellError("Select an account.");
      return;
    }
    if (!sellForm.category) {
      setSellError("Select an investment category.");
      return;
    }
    if (!sellForm.investment_id) {
      setSellError("Select an investment to sell.");
      return;
    }
    const amountValue = Number(sellForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setSellError("Enter a valid total amount.");
      return;
    }
    const quantityValue = Number(sellForm.quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setSellError("Enter a valid quantity.");
      return;
    }
    const priceValue = Number(sellForm.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setSellError("Enter a valid sell price per share.");
      return;
    }
    if (!sellForm.date) {
      setSellError("Select a sell date.");
      return;
    }

    setSellSaving(true);
    setSellError("");
    try {
      const payload = {
        account_id: Number(sellForm.account_id),
        amount: amountValue,
        currency: sellForm.currency || null,
        type: "income",
        category: sellForm.category || null,
        date: sellForm.date,
        notes: sellForm.notes || null,
        investment_id: Number(sellForm.investment_id),
        quantity: quantityValue,
        price: priceValue,
        investment_type: "sell"
      };
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to save sell transaction.");
      }
      await Promise.all([loadPositions(), loadActivity(), loadRealized()]);
      closeSellModal();
    } catch (err) {
      setSellError(err.message);
    } finally {
      setSellSaving(false);
    }
  };

  const handleEsppSellSubmit = async (event) => {
    event.preventDefault();
    if (!esppSellForm.batch_id) {
      setEsppSellError("Select an ESPP batch.");
      return;
    }
    if (!esppSellForm.account_id) {
      setEsppSellError("Select an account.");
      return;
    }
    const quantityValue = Number(esppSellForm.quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setEsppSellError("Enter a valid quantity.");
      return;
    }
    if (
      selectedEsppBatch?.shares_available != null &&
      quantityValue > Number(selectedEsppBatch.shares_available)
    ) {
      setEsppSellError("Quantity exceeds available shares.");
      return;
    }
    const priceValue = Number(esppSellForm.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setEsppSellError("Enter a valid sell price.");
      return;
    }
    if (!esppSellForm.date) {
      setEsppSellError("Select a sell date.");
      return;
    }
    if (!esppSellForm.currency) {
      setEsppSellError("Select a currency.");
      return;
    }

    setEsppSellSaving(true);
    setEsppSellError("");
    try {
      const payload = {
        account_id: Number(esppSellForm.account_id),
        quantity: quantityValue,
        price: priceValue,
        sell_date: esppSellForm.date,
        currency: esppSellForm.currency
      };
      const response = await fetch(
        `/api/espp-periods/${esppSellForm.batch_id}/sell`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to record ESPP sale.");
      }
      await loadEsppBatches(esppSellForm.batch_id);
      await loadEsppBatchValuation(esppSellForm.batch_id);
      closeEsppSellModal();
    } catch (err) {
      setEsppSellError(err.message);
    } finally {
      setEsppSellSaving(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Enter an investment name.");
      return;
    }
    if (!form.asset_type) {
      setError("Select an asset type.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        symbol: form.symbol,
        asset_type: form.asset_type
      };
      const response = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.detail || "Failed to save investment.");
      }
      setForm(emptyForm);
      await loadPositions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertOpen = (entry) => {
    setConvertTarget(entry);
    setConvertDate(entry?.date || entry?.sell_date || "");
    setConvertError("");
  };

  const handleConvertClose = () => {
    if (convertSaving) {
      return;
    }
    setConvertTarget(null);
    setConvertDate("");
    setConvertError("");
  };

  const handleConvertSubmit = async (event) => {
    event.preventDefault();
    if (!convertDate) {
      setConvertError("Select a conversion date.");
      return;
    }
    if (!convertTarget) {
      return;
    }
    setConvertSaving(true);
    setConvertError("");
    try {
      const response = await fetch("/api/currency/convert-to-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: convertTarget.id,
          conversion_date: convertDate
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to convert currency.");
      }
      await Promise.all([loadActivity(), loadRealized()]);
      handleConvertClose();
    } catch (err) {
      setConvertError(err.message);
    } finally {
      setConvertSaving(false);
    }
  };

  useEffect(() => {
    setActivityPage(1);
  }, [activityInvestmentFilter, activityRowsPerPage]);

  useEffect(() => {
    loadAccounts();
    if (!isEsppView) {
      loadCategories();
    }
  }, [isEsppView]);

  useEffect(() => {
    if (!sellModalOpen) {
      return;
    }
    if (!sellForm.account_id && accounts.length === 1) {
      setSellForm((prev) => ({ ...prev, account_id: String(accounts[0].id) }));
    }
    if (!sellForm.category) {
      const investmentCategory = resolveInvestmentCategory();
      if (investmentCategory) {
        setSellForm((prev) => ({ ...prev, category: investmentCategory.name }));
      }
    }
  }, [accounts, categories, sellForm.account_id, sellForm.category, sellModalOpen]);

  useEffect(() => {
    if (!esppSellModalOpen) {
      return;
    }
    if (!esppSellForm.account_id && accounts.length === 1) {
      setEsppSellForm((prev) => ({
        ...prev,
        account_id: String(accounts[0].id)
      }));
    }
    if (!esppSellForm.batch_id && esppBatches.length > 0) {
      setEsppSellForm((prev) => ({
        ...prev,
        batch_id: String(esppBatches[0].period_id)
      }));
    }
  }, [
    accounts,
    esppBatches,
    esppSellForm.account_id,
    esppSellForm.batch_id,
    esppSellModalOpen
  ]);

  useEffect(() => {
    if (!esppSellModalOpen) {
      return;
    }
    if (
      selectedEsppBatch?.stock_currency &&
      esppSellForm.currency !== selectedEsppBatch.stock_currency
    ) {
      setEsppSellForm((prev) => ({
        ...prev,
        currency: selectedEsppBatch.stock_currency
      }));
    }
  }, [
    esppSellForm.currency,
    esppSellModalOpen,
    selectedEsppBatch?.stock_currency
  ]);

  useEffect(() => {
    if (!isEsppView) {
      return;
    }
    if (!esppCloseModalOpen) {
      return;
    }
    if (!esppCloseForm.account_id && accounts.length === 1) {
      setEsppCloseForm((prev) => ({
        ...prev,
        account_id: String(accounts[0].id)
      }));
    }
  }, [accounts, esppCloseForm.account_id, esppCloseModalOpen, isEsppView]);

  useEffect(() => {
    setActivityPage((prev) => {
      if (prev < 1) {
        return 1;
      }
      if (prev > totalActivityPages) {
        return totalActivityPages;
      }
      return prev;
    });
  }, [totalActivityPages]);

  return (
    <div className="mx-auto w-full max-w-full px-4 py-10 sm:max-w-3xl">
      <Button asChild variant="outline">
        <Link href="/">← Back to dashboard</Link>
      </Button>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">
        {isEsppView ? "ESPP" : "Investment assets"}
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        {isEsppView
          ? "Track employee stock purchase plan periods, contributions, and closing summaries."
          : "Maintain the holdings you track and map to investment expenses."}
      </p>

      <div className="mt-8 grid gap-6">
        {!isEsppView ? (
          <Card>
            <CardHeader>
              <CardTitle>Add investment</CardTitle>
              <CardDescription>Store the tickers and asset types you track.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4">
                <label className="text-sm text-slate-600">
                  Name
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Symbol
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="symbol"
                    value={form.symbol}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Asset type
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="asset_type"
                    value={form.asset_type}
                    onChange={handleChange}
                  >
                    {assetTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving}>
                    Add investment
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {isEsppView ? (
          <>
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>ESPP holdings</CardTitle>
                  <CardDescription>
                    Sell shares from a specific ESPP batch.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openEsppSellModal(esppBatches[0])}
                  disabled={esppBatches.length === 0}
                >
                  Sell ESPP Shares
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto md:overflow-visible">
                {esppBatchesLoading ? (
                  <p>Loading ESPP batches...</p>
                ) : null}
                {esppBatchesError ? (
                  <p className="text-sm text-rose-600">{esppBatchesError}</p>
                ) : null}
                {!esppBatchesLoading && esppBatches.length === 0 ? (
                  <p>No ESPP shares available to sell yet.</p>
                ) : null}
                {!esppBatchesLoading && esppBatches.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Purchase date</TableHead>
                        <TableHead className="text-right">Shares available</TableHead>
                        <TableHead className="text-right">Cost per share</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {esppBatches.map((batch) => (
                        <TableRow key={batch.period_id}>
                          <TableCell>
                            <div className="font-medium text-slate-900">
                              {batch.period_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {batch.stock_ticker} ({batch.stock_currency})
                            </div>
                          </TableCell>
                          <TableCell>{formatShortDate(batch.purchase_date)}</TableCell>
                          <TableCell className="text-right">
                            {quantityFormatter.format(
                              Number(batch.shares_available || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(
                              batch.purchase_price,
                              batch.stock_currency
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openEsppSellModal(batch)}
                            >
                              Sell ESPP Shares
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>ESPP periods</CardTitle>
                  <CardDescription>
                    Track the 13 biweekly contributions for each offering.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={openEsppModal}>
                  Start new ESPP period
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                {esppPeriodsLoading ? <p>Loading ESPP periods...</p> : null}
                {esppPeriodsError ? (
                  <p className="text-sm text-rose-600">{esppPeriodsError}</p>
                ) : null}
                {!esppPeriodsLoading && esppPeriods.length === 0 ? (
                  <p>No ESPP periods yet.</p>
                ) : null}
                {!esppPeriodsLoading && esppPeriods.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-end gap-4 text-sm text-slate-600">
                      <label className="min-w-[220px]">
                        Period
                        <select
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={selectedEsppPeriodId}
                          onChange={(event) =>
                            setSelectedEsppPeriodId(event.target.value)
                          }
                        >
                          {esppPeriods.map((period) => (
                            <option key={period.id} value={period.id}>
                              {period.name} • {formatShortDate(period.start_date)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedEsppPeriod ? (
                        <div className="text-sm text-slate-500">
                          {selectedEsppPeriod.stock_ticker} (
                          {selectedEsppPeriod.stock_currency})
                        </div>
                      ) : null}
                    </div>
                    {esppDepositsLoading ? <p>Loading deposits...</p> : null}
                    {esppDepositsError ? (
                      <p className="text-sm text-rose-600">{esppDepositsError}</p>
                    ) : null}
                    {!esppDepositsLoading && selectedEsppPeriod ? (
                      <div className="overflow-x-auto rounded-md border border-slate-200">
                        <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
                          13 biweekly deposits starting{" "}
                          {formatShortDate(selectedEsppPeriod.start_date)}.
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Saved amount ({homeCurrency})</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {esppDepositRows.map((deposit) => (
                              <TableRow
                                key={`${deposit.date}-${deposit.id || "new"}`}
                              >
                                <TableCell>
                                  {formatShortDate(deposit.date)}
                                </TableCell>
                                <TableCell className="min-w-[200px]">
                                  <div className="flex flex-col gap-1">
                                    <input
                                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={deposit.amount_input}
                                      onChange={(event) =>
                                        deposit.id
                                          ? handleEsppDepositChange(
                                              deposit.id,
                                              deposit.date,
                                              event.target.value
                                            )
                                          : null
                                      }
                                      disabled={
                                        !deposit.id ||
                                        selectedEsppPeriod?.status !== "open"
                                      }
                                    />
                                    {deposit.id &&
                                    esppDepositSaving[deposit.id] ? (
                                      <span className="text-xs text-slate-400">
                                        Saving...
                                      </span>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>ESPP summary</CardTitle>
                  <CardDescription>
                    Enter FMVs and exchange rate to preview the purchase.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {esppSummaryLoading ? (
                    <span className="text-xs text-slate-400">Calculating...</span>
                  ) : null}
                  {selectedEsppPeriod?.status === "open" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openEsppCloseModal}
                      disabled={!esppSummaryData?.shares_left}
                    >
                      Close ESPP period
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedEsppPeriod ? (
                  <p className="text-sm text-slate-500">
                    Select an ESPP period to see the summary.
                  </p>
                ) : selectedEsppPeriod.status !== "open" ? (
                  <p className="text-sm text-slate-500">
                    Summary is available only while the period is open.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="text-sm text-slate-600">
                        Open FMV ({selectedEsppPeriod.stock_currency})
                        <input
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          type="number"
                          step="0.00001"
                          min="0"
                          name="open_fmv"
                          value={esppSummaryOpenFmvInput}
                          onChange={handleEsppSummaryInputChange}
                        />
                      </label>
                      <label className="text-sm text-slate-600">
                        Close FMV ({selectedEsppPeriod.stock_currency})
                        <input
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          type="number"
                          step="0.00001"
                          min="0"
                          name="close_fmv"
                          value={esppSummaryInputsForPeriod.close_fmv}
                          onChange={handleEsppSummaryInputChange}
                        />
                      </label>
                      <label className="text-sm text-slate-600">
                        Exchange rate ({homeCurrency} →{" "}
                        {selectedEsppPeriod.stock_currency})
                        <input
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          type="number"
                          step="0.000001"
                          min="0"
                          name="exchange_rate"
                          value={esppSummaryInputsForPeriod.exchange_rate}
                          onChange={handleEsppSummaryInputChange}
                        />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Total invested ({homeCurrency})
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.total_invested_home != null
                            ? formatMoney(
                                esppSummaryData.total_invested_home,
                                homeCurrency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Total invested ({selectedEsppPeriod.stock_currency})
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.total_invested_stock_currency !=
                          null
                            ? formatMoney(
                                esppSummaryData.total_invested_stock_currency,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">Min FMV</div>
                        <div className="text-slate-900">
                          {esppSummaryData?.min_fmv != null
                            ? formatPrice(
                                esppSummaryData.min_fmv,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Purchase price
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.purchase_price != null
                            ? formatPrice(
                                esppSummaryData.purchase_price,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Shares purchased
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.shares_purchased != null
                            ? quantityFormatter.format(
                                Number(esppSummaryData.shares_purchased)
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">Taxes paid</div>
                        <div className="text-slate-900">
                          {esppSummaryData?.taxes_paid != null
                            ? formatMoney(
                                esppSummaryData.taxes_paid,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Shares withheld
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.shares_withheld != null
                            ? quantityFormatter.format(
                                Number(esppSummaryData.shares_withheld)
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">Shares left</div>
                        <div className="text-slate-900">
                          {esppSummaryData?.shares_left != null
                            ? quantityFormatter.format(
                                Number(esppSummaryData.shares_left)
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Paid with shares
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.paid_with_shares != null
                            ? formatMoney(
                                esppSummaryData.paid_with_shares,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Refunded from taxes
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.refunded_from_taxes != null
                            ? formatMoney(
                                esppSummaryData.refunded_from_taxes,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Unused for shares
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.unused_for_shares != null
                            ? formatMoney(
                                esppSummaryData.unused_for_shares,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                        <div className="text-xs text-slate-500">
                          Total refunded
                        </div>
                        <div className="text-slate-900">
                          {esppSummaryData?.total_refunded != null
                            ? formatMoney(
                                esppSummaryData.total_refunded,
                                selectedEsppPeriod.stock_currency
                              )
                            : "-"}
                        </div>
                      </div>
                    </div>
                    {esppSummaryError ? (
                      <p className="mt-3 text-sm text-rose-600">
                        {esppSummaryError}
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>ESPP valuation</CardTitle>
                  <CardDescription>
                    Live pricing and FX refresh every 30 minutes.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEsppRefresh}
                    disabled={
                      selectedEsppPeriod?.status !== "closed" ||
                      esppMarketLoading ||
                      esppFxLoading
                    }
                  >
                    Refresh now
                  </Button>
                  {selectedEsppPeriod?.status === "closed" ? (
                    <Button type="button" variant="outline" asChild>
                      <Link href="/investments">Go to Investments</Link>
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedEsppPeriod ? (
                  <p className="text-sm text-slate-500">
                    Select an ESPP period to view the valuation.
                  </p>
                ) : selectedEsppPeriod.status !== "closed" ? (
                  <p className="text-sm text-slate-500">
                    Valuation is available after the period is closed.
                  </p>
                ) : (
                  <>
                    {esppClosureLoading ? (
                      <p className="text-sm text-slate-500">
                        Loading close summary...
                      </p>
                    ) : null}
                    {esppBatchValuationLoading ? (
                      <p className="text-sm text-slate-500">
                        Loading batch valuation...
                      </p>
                    ) : null}
                    {esppClosureError ? (
                      <p className="text-sm text-rose-600">
                        {esppClosureError}
                      </p>
                    ) : null}
                    {esppBatchValuationError ? (
                      <p className="text-sm text-rose-600">
                        {esppBatchValuationError}
                      </p>
                    ) : null}
                    {!esppPostCloseSummary && !esppClosureLoading ? (
                      <p className="text-sm text-slate-500">
                        Close summary unavailable for this period yet.
                      </p>
                    ) : null}
                    {esppPostCloseSummary ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Ticker current price ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.livePrice != null
                                ? formatPrice(
                                    esppLiveMetrics.livePrice,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Unrealized value ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.unrealizedValue != null
                                ? formatMoney(
                                    esppLiveMetrics.unrealizedValue,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Realized value ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.realizedValue != null
                                ? formatMoney(
                                    esppLiveMetrics.realizedValue,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Total ESPP value ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.totalEsppValue != null
                                ? formatMoney(
                                    esppLiveMetrics.totalEsppValue,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Taxes ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.estimatedTaxes != null
                                ? formatMoney(
                                    esppLiveMetrics.estimatedTaxes,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              Can sell amount ({selectedEsppPeriod.stock_currency})
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.canSellValue != null
                                ? formatMoney(
                                    esppLiveMetrics.canSellValue,
                                    selectedEsppPeriod.stock_currency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              In {homeCurrency}
                            </div>
                            <div className="text-slate-900">
                              {esppLiveMetrics?.canSellHome != null
                                ? formatMoney(
                                    esppLiveMetrics.canSellHome,
                                    homeCurrency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              P&amp;L ({homeCurrency})
                            </div>
                            <div
                              className={
                                esppLiveMetrics?.profitLoss == null
                                  ? "text-slate-900"
                                  : esppLiveMetrics.profitLoss < 0
                                    ? "text-rose-600"
                                    : "text-emerald-600"
                              }
                            >
                              {esppLiveMetrics?.profitLoss != null
                                ? formatMoney(
                                    esppLiveMetrics.profitLoss,
                                    homeCurrency
                                  )
                                : "-"}
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm">
                            <div className="text-xs text-slate-500">
                              P&amp;L %
                            </div>
                            <div
                              className={
                                esppLiveMetrics?.profitLossPercent == null
                                  ? "text-slate-900"
                                  : esppLiveMetrics.profitLossPercent < 0
                                    ? "text-rose-600"
                                    : "text-emerald-600"
                              }
                            >
                              {esppLiveMetrics?.profitLossPercent != null
                                ? percentFormatter.format(
                                    esppLiveMetrics.profitLossPercent
                                  )
                                : "-"}
                            </div>
                          </div>
                        </div>
                        {(esppMarketLoading || esppFxLoading) ? (
                          <p className="mt-3 text-xs text-slate-400">
                            Fetching live market data...
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {esppMarketError ? (
                      <p className="mt-2 text-sm text-rose-600">
                        {esppMarketError}
                      </p>
                    ) : null}
                    {esppFxError ? (
                      <p className="mt-2 text-sm text-rose-600">
                        {esppFxError}
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {!isEsppView ? (
          <Card>
            <CardHeader>
              <CardTitle>Current holdings</CardTitle>
              <CardDescription>Holdings based on weighted average cost.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto md:overflow-visible">
              {loading ? <p>Loading positions...</p> : null}
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              {!loading && positions.length === 0 ? (
                <p>No investment positions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investment</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Avg cost</TableHead>
                      <TableHead className="text-right">Cost basis</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((position) => (
                      <TableRow key={position.id}>
                        <TableCell>
                          <div className="font-medium text-slate-900">
                            {position.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {position.symbol || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {quantityFormatter.format(
                            Number(position.total_shares || 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(
                            position.average_cost_per_share,
                            position.currency
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(position.total_cost_basis, position.currency)}
                        </TableCell>
                        <TableCell>{position.currency || "-"}</TableCell>
                        <TableCell>
                          {String(position.source || "").toLowerCase() === "espp" ? (
                            <Button asChild type="button" variant="outline">
                              <Link href="/espp">View</Link>
                            </Button>
                          ) : String(position.source || "").toLowerCase() ===
                            "rsu" ? (
                            <Button asChild type="button" variant="outline">
                              <Link href="/rsu">View</Link>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openSellModal(position)}
                            >
                              Sell
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {!isEsppView ? (
          <RealizedInvestmentsCard
            realized={realized}
            loading={realizedLoading}
            error={realizedError}
            onConvert={handleConvertOpen}
            onTransactionSelect={handleRealizedTransactionOpen}
            convertDisabled={convertSaving}
            homeCurrency={homeCurrency}
            formatMoney={formatMoney}
            quantityFormatter={quantityFormatter}
            isForeignCurrency={isForeignCurrency}
          />
        ) : null}

        {!isEsppView ? (
          <Card>
            <CardHeader>
              <CardTitle>Investment activity</CardTitle>
              <CardDescription>
                Review buy and sell activity tied to transactions.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto md:overflow-visible">
            {activity.length > 0 ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <label className="min-w-[200px]">
                    Investment
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      value={activityInvestmentFilter}
                      onChange={(event) =>
                        setActivityInvestmentFilter(event.target.value)
                      }
                    >
                      <option value="all">All investments</option>
                      {activityInvestmentOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                          {option.symbol ? ` (${option.symbol})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rows per page
                    <select
                      className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      value={activityRowsPerPage}
                      onChange={(event) =>
                        setActivityRowsPerPage(Number(event.target.value))
                      }
                    >
                      {[5, 10, 25, 50].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-slate-500">
                    Page {activityPage} of {totalActivityPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActivityPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={activityPage <= 1}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActivityPage((prev) =>
                        Math.min(totalActivityPages, prev + 1)
                      )
                    }
                    disabled={activityPage >= totalActivityPages}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}
            {activityLoading ? <p>Loading activity...</p> : null}
            {activityError ? (
              <p className="text-sm text-rose-600">{activityError}</p>
            ) : null}
            {!activityLoading && activity.length === 0 ? (
              <p>No investment activity yet.</p>
            ) : null}
            {!activityLoading && activity.length > 0 && filteredActivity.length === 0 ? (
              <p>No activity matches that filter.</p>
            ) : null}
            {!activityLoading && filteredActivity.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investment</TableHead>
                    <TableHead>Action</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedActivity.map((entry) => (
                    <TableRow
                      key={entry.id}
                      onClick={() => handleActivityTransactionOpen(entry)}
                      onKeyDown={(event) => handleTransactionRowKeyDown(event, entry)}
                      tabIndex={0}
                      role="button"
                      className="cursor-pointer"
                    >
                      <TableCell>
                        {entry.investment_name}
                        {entry.investment_symbol
                          ? ` (${entry.investment_symbol})`
                          : ""}
                      </TableCell>
                      <TableCell className="capitalize">{entry.type}</TableCell>
                      <TableCell className="text-right">
                        {quantityFormatter.format(Number(entry.quantity || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {currencyFormatter.format(Number(entry.price || 0))}
                      </TableCell>
                      <TableCell>{entry.date}</TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-700">
                          Transaction #{entry.transaction_id}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
      {isEsppView ? (
        <Dialog
          open={esppModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEsppModalOpen(false);
            }
          }}
        >
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>Start a new ESPP period</DialogTitle>
              <DialogDescription>
                Capture the basics to create 13 biweekly deposit slots.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEsppCreate} className="grid gap-3">
              <label className="text-sm text-slate-600">
                Period name
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="name"
                  value={esppForm.name}
                  onChange={handleEsppFormChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Start date
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="start_date"
                  type="date"
                  value={esppForm.start_date}
                  onChange={handleEsppFormChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Stock ticker
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="stock_ticker"
                  value={esppForm.stock_ticker}
                  onChange={handleEsppFormChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Stock currency
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="stock_currency"
                  value={esppForm.stock_currency}
                  onChange={handleEsppFormChange}
                  required
                >
                  {CURRENCY_OPTIONS.filter((option) => option.value).map(
                    (option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </label>
              {esppFormError ? (
                <p className="text-sm text-rose-600">{esppFormError}</p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEsppModalOpen(false)}
                    disabled={esppSaving}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={esppSaving}>
                  Create period
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {isEsppView ? (
        <Dialog
          open={esppSellModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeEsppSellModal();
            }
          }}
        >
          <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Sell ESPP shares</DialogTitle>
              <DialogDescription>
                Choose a batch and record a sale for that period.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEsppSellSubmit} className="grid gap-3">
              <div className="rounded-md border border-slate-200">
                {esppBatches.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    No ESPP batches available to sell.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Select</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Purchase date</TableHead>
                        <TableHead className="text-right">Shares available</TableHead>
                        <TableHead className="text-right">Cost per share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {esppBatches.map((batch) => (
                        <TableRow key={batch.period_id}>
                          <TableCell>
                            <input
                              type="radio"
                              name="batch_id"
                              value={batch.period_id}
                              checked={
                                String(esppSellForm.batch_id) ===
                                String(batch.period_id)
                              }
                              onChange={handleEsppSellChange}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">
                              {batch.period_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {batch.stock_ticker} ({batch.stock_currency})
                            </div>
                          </TableCell>
                          <TableCell>{formatShortDate(batch.purchase_date)}</TableCell>
                          <TableCell className="text-right">
                            {quantityFormatter.format(
                              Number(batch.shares_available || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPrice(
                              batch.purchase_price,
                              batch.stock_currency
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <label className="text-sm text-slate-600">
                Account
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="account_id"
                  value={esppSellForm.account_id}
                  onChange={handleEsppSellChange}
                  required
                >
                  <option value="">Select an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} • {account.type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Quantity
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="quantity"
                  type="number"
                  step="0.0001"
                  min="0"
                  max={selectedEsppBatch?.shares_available || undefined}
                  value={esppSellForm.quantity}
                  onChange={handleEsppSellChange}
                  required
                />
                {selectedEsppBatch?.shares_available != null ? (
                  <span className="mt-1 block text-xs text-slate-500">
                    Available:{" "}
                    {quantityFormatter.format(
                      Number(selectedEsppBatch.shares_available || 0)
                    )}
                  </span>
                ) : null}
              </label>
              <label className="text-sm text-slate-600">
                Sell price per share
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="price"
                  type="number"
                  step="0.00001"
                  min="0"
                  value={esppSellForm.price}
                  onChange={handleEsppSellChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Sell date
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="date"
                  type="date"
                  value={esppSellForm.date}
                  onChange={handleEsppSellChange}
                  required
                />
              </label>
              <label className="text-sm text-slate-600">
                Currency
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="currency"
                  value={esppSellForm.currency}
                  onChange={handleEsppSellChange}
                  required
                >
                  <option value="">Select currency</option>
                  {esppSellCurrencyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {esppSellError ? (
                <p className="text-sm text-rose-600">{esppSellError}</p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeEsppSellModal}
                    disabled={esppSellSaving}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={esppSellSaving || esppBatches.length === 0}
                >
                  {esppSellSaving ? "Saving..." : "Record sell"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {isEsppView ? (
        <Dialog
          open={esppCloseModalOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeEsppCloseModal();
            }
          }}
        >
          <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Close ESPP period</DialogTitle>
              <DialogDescription>
                Confirm the purchase details and create the ESPP investment entry.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEsppCloseSubmit} className="grid gap-4">
              <label className="text-sm text-slate-600">
                Account
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  name="account_id"
                  value={esppCloseForm.account_id}
                  onChange={handleEsppCloseInputChange}
                  required
                >
                  <option value="">Select an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} • {account.type}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm text-slate-600">
                  Open FMV ({selectedEsppPeriod?.stock_currency})
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    type="number"
                    step="0.00001"
                    min="0"
                    name="open_fmv"
                    value={esppCloseForm.open_fmv}
                    onChange={handleEsppCloseInputChange}
                    readOnly
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Close FMV ({selectedEsppPeriod?.stock_currency})
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    type="number"
                    step="0.00001"
                    min="0"
                    name="close_fmv"
                    value={esppCloseForm.close_fmv}
                    onChange={handleEsppCloseInputChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Exchange rate ({homeCurrency} →{" "}
                  {selectedEsppPeriod?.stock_currency})
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    type="number"
                    step="0.000001"
                    min="0"
                    name="exchange_rate"
                    value={esppCloseForm.exchange_rate}
                    onChange={handleEsppCloseInputChange}
                    required
                  />
                </label>
              </div>
              <div className="rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Calculated summary</span>
                  {esppCloseLoading ? <span>Updating...</span> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">
                      Total invested ({homeCurrency})
                    </div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.total_invested_home != null
                        ? formatMoney(
                            esppCloseSummaryData.total_invested_home,
                            homeCurrency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Total invested ({selectedEsppPeriod?.stock_currency})
                    </div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.total_invested_stock_currency !=
                      null
                        ? formatMoney(
                            esppCloseSummaryData.total_invested_stock_currency,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Min FMV</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.min_fmv != null
                        ? formatPrice(
                            esppCloseSummaryData.min_fmv,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Purchase price</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.purchase_price != null
                        ? formatPrice(
                            esppCloseSummaryData.purchase_price,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Shares purchased</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.shares_purchased != null
                        ? quantityFormatter.format(
                            Number(esppCloseSummaryData.shares_purchased)
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Taxes paid</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.taxes_paid != null
                        ? formatMoney(
                            esppCloseSummaryData.taxes_paid,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Shares withheld</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.shares_withheld != null
                        ? quantityFormatter.format(
                            Number(esppCloseSummaryData.shares_withheld)
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Shares left</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.shares_left != null
                        ? quantityFormatter.format(
                            Number(esppCloseSummaryData.shares_left)
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Paid with shares</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.paid_with_shares != null
                        ? formatMoney(
                            esppCloseSummaryData.paid_with_shares,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">
                      Refunded from taxes
                    </div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.refunded_from_taxes != null
                        ? formatMoney(
                            esppCloseSummaryData.refunded_from_taxes,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Unused for shares</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.unused_for_shares != null
                        ? formatMoney(
                            esppCloseSummaryData.unused_for_shares,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total refunded</div>
                    <div className="text-slate-900">
                      {esppCloseSummaryData?.total_refunded != null
                        ? formatMoney(
                            esppCloseSummaryData.total_refunded,
                            selectedEsppPeriod?.stock_currency
                          )
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>
              {esppCloseError ? (
                <p className="text-sm text-rose-600">{esppCloseError}</p>
              ) : null}
              <DialogFooter>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeEsppCloseModal}
                    disabled={esppCloseSaving}
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={esppCloseSaving}>
                  Close period
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {!isEsppView ? (
        <>
          <Dialog
            open={Boolean(convertTarget)}
            onOpenChange={(open) => {
              if (!open) {
                handleConvertClose();
              }
            }}
          >
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Convert to {homeCurrency}</DialogTitle>
                <DialogDescription>
                  This updates the linked transaction amount and currency.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleConvertSubmit} className="grid gap-4">
                <label className="text-sm text-slate-600">
                  Conversion date
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    type="date"
                    value={convertDate}
                    onChange={(event) => setConvertDate(event.target.value)}
                    required
                  />
                </label>
                {convertError ? (
                  <p className="text-sm text-rose-600">{convertError}</p>
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleConvertClose}
                      disabled={convertSaving}
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={convertSaving}>
                    Convert
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
              }
            }}
          >
            <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Sell {sellTarget?.name || "investment"}</DialogTitle>
                <DialogDescription>
                  Record a sell transaction for this holding.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSellSubmit} className="grid gap-3">
                <label className="text-sm text-slate-600">
                  Account
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="account_id"
                    value={sellForm.account_id}
                    onChange={handleSellChange}
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                {accountsError ? (
                  <p className="text-sm text-rose-600">{accountsError}</p>
                ) : null}
                <label className="text-sm text-slate-600">
                  Total amount
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={sellForm.amount}
                    onChange={handleSellChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Currency
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="currency"
                    value={sellForm.currency}
                    onChange={handleSellChange}
                  >
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option.value || "default"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Investment category
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="category"
                    value={sellForm.category}
                    onChange={handleSellChange}
                  >
                    <option value="">Select category</option>
                    {categories
                      .filter((category) => category.group === "investments")
                      .map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </label>
                {categoriesError ? (
                  <p className="text-sm text-rose-600">{categoriesError}</p>
                ) : null}
                <label className="text-sm text-slate-600">
                  Quantity
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="quantity"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={sellForm.quantity}
                    onChange={handleSellChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Sell price per share
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="price"
                    type="number"
                    step="0.00001"
                    min="0"
                    value={sellForm.price}
                    onChange={handleSellChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Sell date
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="date"
                    type="date"
                    value={sellForm.date}
                    onChange={handleSellChange}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Notes
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    name="notes"
                    value={sellForm.notes}
                    onChange={handleSellChange}
                    placeholder="Optional"
                  />
                </label>
                {sellError ? (
                  <p className="text-sm text-rose-600">{sellError}</p>
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={closeSellModal}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    disabled={sellSaving || accounts.length === 0}
                  >
                    {sellSaving ? "Saving..." : "Record sell"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <TransactionDetailModal
            open={transactionModalOpen}
            onClose={closeTransactionModal}
            transactionId={selectedTransactionId}
            transaction={selectedTransaction}
            investmentLabel={selectedTransactionInvestment}
            loading={
              transactionLookupLoading &&
              Boolean(selectedTransactionId) &&
              !transactionLookup?.[selectedTransactionId]
            }
            error={transactionLookupError}
          />
        </>
      ) : null}
    </div>
  );
}

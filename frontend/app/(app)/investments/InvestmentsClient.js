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

export default function InvestmentsClient() {
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
  const [transactionLookup, setTransactionLookup] = useState(null);
  const [transactionLookupLoading, setTransactionLookupLoading] = useState(false);
  const [transactionLookupError, setTransactionLookupError] = useState("");
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [selectedTransactionFallback, setSelectedTransactionFallback] = useState(null);
  const [selectedTransactionInvestment, setSelectedTransactionInvestment] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const esppSaveTimers = useRef({});

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

  useEffect(() => {
    loadPositions();
    loadActivity();
    loadRealized();
    loadHomeCurrency();
    loadEsppPeriods();
  }, []);

  useEffect(() => {
    if (!selectedEsppPeriodId) {
      setEsppDeposits([]);
      return;
    }
    loadEsppDeposits(selectedEsppPeriodId);
  }, [selectedEsppPeriodId]);

  useEffect(
    () => () => {
      Object.values(esppSaveTimers.current).forEach((timer) =>
        clearTimeout(timer)
      );
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

  const handleSellChange = (event) => {
    const { name, value } = event.target;
    setSellForm((prev) => ({ ...prev, [name]: value }));
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
    loadCategories();
  }, []);

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
        Investment assets
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Maintain the holdings you track and map to investment expenses.
      </p>

      <div className="mt-8 grid gap-6">
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
                          <TableRow key={`${deposit.date}-${deposit.id || "new"}`}>
                            <TableCell>{formatShortDate(deposit.date)}</TableCell>
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
                                  disabled={!deposit.id}
                                />
                                {deposit.id && esppDepositSaving[deposit.id] ? (
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
                        {quantityFormatter.format(Number(position.total_shares || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(position.average_cost_per_share, position.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(position.total_cost_basis, position.currency)}
                      </TableCell>
                      <TableCell>{position.currency || "-"}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openSellModal(position)}
                        >
                          Sell
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle>Investment activity</CardTitle>
            <CardDescription>Review buy and sell activity tied to transactions.</CardDescription>
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
      </div>
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
                {CURRENCY_OPTIONS.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
              <Button type="submit" disabled={sellSaving || accounts.length === 0}>
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
    </div>
  );
}

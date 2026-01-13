"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { getConversionNote, getCurrencyFormatter } from "../../lib/currency";

const RESOLUTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" }
];

const TIMEFRAMES = [
  { value: "30D", label: "Last 30 days" },
  { value: "3M", label: "Last 3 months" },
  { value: "6M", label: "Last 6 months" },
  { value: "1Y", label: "Last 1 year" },
  { value: "2Y", label: "Last 2 years" }
];

const LINE_COLORS = [
  "#0f172a",
  "#0284c7",
  "#ea580c",
  "#16a34a",
  "#dc2626",
  "#0d9488",
  "#a16207",
  "#1d4ed8",
  "#7c2d12"
];

const parseDate = (value) => new Date(`${value}T00:00:00`);

const formatBucketLabel = (date, resolution) => {
  if (resolution === "yearly") return `${date.getFullYear()}`;
  if (resolution === "monthly") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric"
    });
  }
  if (resolution === "weekly") {
    return `Week of ${date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    })}`;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
};

const getCategoryColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return LINE_COLORS[Math.abs(hash) % LINE_COLORS.length];
};

export default function SpendingByCategoryLineChartCard({
  className = "",
  homeCurrency = "USD"
}) {
  const [categories, setCategories] = useState([]);
  const [reportBuckets, setReportBuckets] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState("weekly");
  const [timeframe, setTimeframe] = useState("3M");
  const currencyFormatter = useMemo(
    () => getCurrencyFormatter(homeCurrency, { maximumFractionDigits: 0 }),
    [homeCurrency]
  );

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      setError("");
      try {
        const response = await fetch("/api/categories");
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.detail || "Failed to load categories.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setCategories(data);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) setCategoriesLoading(false);
      }
    };
    loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadCategoryTrends = async () => {
      setReportLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams({ resolution, timeframe });
        const response = await fetch(
          `/api/reports/category-trends?${searchParams.toString()}`
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.detail || "Failed to load category trends.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setReportBuckets(data?.buckets || []);
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) setReportLoading(false);
      }
    };
    loadCategoryTrends();
    return () => {
      isMounted = false;
    };
  }, [resolution, timeframe]);

  const categoryOrder = useMemo(() => {
    return new Map(categories.map((category, index) => [category.name, index]));
  }, [categories]);

  const toggleCategory = (name) => {
    setSelectedCategories((current) => {
      const exists = current.includes(name);
      const next = exists ? current.filter((item) => item !== name) : [...current, name];
      return next.sort(
        (a, b) => (categoryOrder.get(a) ?? 0) - (categoryOrder.get(b) ?? 0)
      );
    });
  };

  const { series, selectedCategoryList, hasData } = useMemo(() => {
    if (selectedCategories.length === 0) {
      return { series: [], selectedCategoryList: [], hasData: false };
    }

    if (!reportBuckets.length) {
      return { series: [], selectedCategoryList: selectedCategories, hasData: false };
    }

    let dataHasValue = false;
    const seriesData = reportBuckets.map((bucket) => {
      const row = {
        label: formatBucketLabel(parseDate(bucket.bucket_start), resolution),
        sourceCurrencies: bucket.source_currencies || []
      };
      selectedCategories.forEach((category) => {
        const value = Number(bucket.totals_by_category?.[category] || 0);
        if (value > 0) dataHasValue = true;
        row[category] = value;
      });
      return row;
    });

    return {
      series: seriesData,
      selectedCategoryList: selectedCategories,
      hasData: dataHasValue
    };
  }, [reportBuckets, resolution, selectedCategories]);

  const selectClass =
    "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10";

  const checkboxClass =
    "h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20";

  const isLoading = categoriesLoading || reportLoading;

  const showEmptySelection = !isLoading && !error && selectedCategories.length === 0;
  const showNoData = !isLoading && !error && selectedCategories.length > 0 && !hasData;

  return (
    <Card className={`lg:col-span-12 ${className}`.trim()}>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>
          Compare expense trends for selected categories.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-full lg:w-72">
            <div className="grid gap-4">
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Resolution
                <select
                  className={selectClass}
                  value={resolution}
                  onChange={(event) => setResolution(event.target.value)}
                >
                  {RESOLUTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs uppercase tracking-[0.12em] text-slate-500">
                Timeframe
                <select
                  className={selectClass}
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value)}
                >
                  {TIMEFRAMES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
                  Categories
                </p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
                  {categoriesLoading ? <p className="text-sm">Loading categories...</p> : null}
                  {!categoriesLoading && categories.length === 0 ? (
                    <p className="text-sm text-slate-500">No categories yet.</p>
                  ) : null}
                  {!categoriesLoading
                    ? categories.map((category) => (
                        <label
                          key={category.id}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            className={checkboxClass}
                            checked={selectedCategories.includes(category.name)}
                            onChange={() => toggleCategory(category.name)}
                          />
                          <span
                            className="inline-flex h-2 w-2 rounded-full"
                            style={{ backgroundColor: getCategoryColor(category.name) }}
                          />
                          {category.name}
                        </label>
                      ))
                    : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-[220px] flex-1 items-center sm:min-h-[260px]">
            {isLoading ? <p>Loading spending data...</p> : null}
            {error ? <p className="text-rose-600">{error}</p> : null}
            {showEmptySelection ? (
              <p className="text-sm text-slate-500">
                Select one or more categories to view spending trends.
              </p>
            ) : null}
            {showNoData ? (
              <p className="text-sm text-slate-500">No expense activity yet.</p>
            ) : null}

            {!isLoading && !error && series.length > 0 ? (
              <div className="h-[240px] w-full sm:h-[320px]">
                <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
                  {selectedCategoryList.map((name) => (
                    <span key={name} className="flex items-center gap-2">
                      <span
                        className="inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: getCategoryColor(name) }}
                      />
                      {name}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 24, bottom: 36, left: 8 }}>
                    <CartesianGrid stroke="rgba(34, 37, 43, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      tick={{ fontSize: 10, fill: "#6b6f78" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value) => currencyFormatter.format(value)}
                      width={72}
                      domain={[0, "dataMax"]}
                      tick={{ fontSize: 11, fill: "#6b6f78" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const conversionNote = getConversionNote(
                          payload[0]?.payload?.sourceCurrencies,
                          homeCurrency
                        );
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            <p className="mb-1 text-xs font-semibold text-slate-900">{label}</p>
                            {payload.map((entry) => (
                              <div key={entry.dataKey} className="flex items-center gap-2">
                                <span
                                  className="inline-flex h-2 w-2 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="flex-1">{entry.dataKey}</span>
                                <span>{currencyFormatter.format(entry.value || 0)}</span>
                              </div>
                            ))}
                            {conversionNote ? (
                              <p className="mt-1 text-slate-500">{conversionNote}</p>
                            ) : null}
                          </div>
                        );
                      }}
                      cursor={{ stroke: "rgba(46, 47, 51, 0.2)" }}
                      wrapperStyle={{ outline: "none" }}
                    />
                    {selectedCategoryList.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={getCategoryColor(name)}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

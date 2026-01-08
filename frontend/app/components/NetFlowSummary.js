"use client";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export default function NetFlowSummary({
  netFlow = 0,
  monthLabel = "",
  description = "Income minus expenses for the current month.",
  percentageChange = null
}) {
  const parsedPercentage = Number(percentageChange);
  const hasPercentage = Number.isFinite(parsedPercentage);
  const formattedPercentage = hasPercentage
    ? `${parsedPercentage > 0 ? "+" : ""}${parsedPercentage.toFixed(1)}%`
    : "—";
  const isPositive = hasPercentage && parsedPercentage > 0;
  const isNegative = hasPercentage && parsedPercentage < 0;
  const trendTone = isPositive
    ? "text-emerald-600"
    : isNegative
      ? "text-rose-600"
      : "text-slate-500";

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
        Net flow · {monthLabel}
      </p>
      <p className="mt-3 text-4xl font-semibold text-slate-900 sm:text-5xl">
        {currencyFormatter.format(netFlow)}
      </p>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className={`font-semibold ${trendTone}`}>
          {isPositive ? <span aria-hidden="true">&uarr;</span> : null}
          {isNegative ? <span aria-hidden="true">&darr;</span> : null}{" "}
          {formattedPercentage}
        </span>
        <span className="text-slate-500">vs previous month</span>
      </div>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

"use client";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export default function NetFlowSummary({
  netFlow = 0,
  monthLabel = "",
  description = "Income minus expenses for the current month."
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">
        Net flow · {monthLabel}
      </p>
      <p className="mt-3 text-4xl font-semibold text-slate-900 sm:text-5xl">
        {currencyFormatter.format(netFlow)}
      </p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}

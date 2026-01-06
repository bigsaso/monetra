"use client";

import { useMemo, useRef, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatAmount = (value) => currencyFormatter.format(value);

const formatMonthLabel = (value) => value || "-";

export default function MonthlyCashflowChart({ data }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const chartData = useMemo(
    () =>
      (data || []).map((item) => {
        const income = Number(item.total_income || 0);
        const expenses = Number(item.total_expenses || 0);
        const net = Number(item.net_cashflow || 0);
        return {
          month: item.month,
          income,
          expenses,
          net
        };
      }),
    [data]
  );

  const metrics = useMemo(() => {
    if (!chartData.length) {
      return { minValue: 0, maxValue: 0 };
    }
    const values = chartData.flatMap((item) => [
      item.income,
      item.expenses,
      item.net
    ]);
    const maxValue = Math.max(0, ...values);
    const minValue = Math.min(0, ...values);
    return { minValue, maxValue };
  }, [chartData]);

  const width = 720;
  const height = 280;
  const padding = { top: 20, right: 24, bottom: 44, left: 64 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const range = metrics.maxValue - metrics.minValue || 1;

  const scaleY = (value) =>
    padding.top + ((metrics.maxValue - value) / range) * chartHeight;

  const zeroY = scaleY(0);

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => {
    return metrics.maxValue - (range * index) / tickCount;
  });

  const groupWidth = chartData.length ? chartWidth / chartData.length : 0;
  const barWidth = groupWidth * 0.28;
  const barGap = groupWidth * 0.12;

  const handleHover = (event, index) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    setTooltip({ index, x, y, width: bounds.width });
  };

  const handleLeave = () => setTooltip(null);

  const tooltipData =
    tooltip && chartData[tooltip.index] ? chartData[tooltip.index] : null;

  const tooltipStyle = tooltip
    ? {
        left: `${Math.min(Math.max(tooltip.x, 90), tooltip.width - 90)}px`,
        top: `${Math.max(tooltip.y - 12, 12)}px`
      }
    : {};

  if (!chartData.length) {
    return <p className="chart-empty">No monthly cashflow data yet.</p>;
  }

  return (
    <div className="chart" ref={containerRef} onMouseLeave={handleLeave}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <g>
          {tickValues.map((value) => {
            const y = scaleY(value);
            return (
              <g key={`grid-${value}`}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  className="grid-line"
                />
                <text x={padding.left - 12} y={y + 4} className="tick">
                  {formatAmount(value)}
                </text>
              </g>
            );
          })}
        </g>

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={zeroY}
          y2={zeroY}
          className="axis-line"
        />

        {chartData.map((item, index) => {
          const groupX = padding.left + index * groupWidth;
          const incomeHeight = Math.abs(zeroY - scaleY(item.income));
          const expenseHeight = Math.abs(zeroY - scaleY(item.expenses));
          const incomeX = groupX + (groupWidth - (2 * barWidth + barGap)) / 2;
          const expenseX = incomeX + barWidth + barGap;

          return (
            <g key={item.month}>
              <rect
                x={incomeX}
                y={scaleY(item.income)}
                width={barWidth}
                height={incomeHeight}
                className="bar income"
                rx="4"
              />
              <rect
                x={expenseX}
                y={scaleY(item.expenses)}
                width={barWidth}
                height={expenseHeight}
                className="bar expense"
                rx="4"
              />
              <rect
                x={groupX}
                y={padding.top}
                width={groupWidth}
                height={chartHeight}
                className="hover-target"
                onMouseMove={(event) => handleHover(event, index)}
                onFocus={(event) => handleHover(event, index)}
                tabIndex={0}
              />
              <text
                x={groupX + groupWidth / 2}
                y={height - padding.bottom + 22}
                textAnchor="middle"
                className="month"
              >
                {formatMonthLabel(item.month)}
              </text>
            </g>
          );
        })}

        <polyline
          fill="none"
          className="net-line"
          points={chartData
            .map((item, index) => {
              const x = padding.left + index * groupWidth + groupWidth / 2;
              const y = scaleY(item.net);
              return `${x},${y}`;
            })
            .join(" ")}
        />

        {chartData.map((item, index) => {
          const x = padding.left + index * groupWidth + groupWidth / 2;
          const y = scaleY(item.net);
          return (
            <circle
              key={`point-${item.month}`}
              cx={x}
              cy={y}
              r="3"
              className="net-point"
            />
          );
        })}
      </svg>

      {tooltipData ? (
        <div className="tooltip" style={tooltipStyle}>
          <p className="tooltip-title">{tooltipData.month}</p>
          <p>Income: {formatAmount(tooltipData.income)}</p>
          <p>Expenses: {formatAmount(tooltipData.expenses)}</p>
          <p>Net: {formatAmount(tooltipData.net)}</p>
        </div>
      ) : null}

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch income" /> Income
        </span>
        <span className="legend-item">
          <span className="legend-swatch expense" /> Expenses
        </span>
        <span className="legend-item">
          <span className="legend-swatch net" /> Net cashflow
        </span>
      </div>

      <style jsx>{`
        .chart {
          position: relative;
          width: 100%;
        }

        svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .grid-line {
          stroke: rgba(34, 37, 43, 0.08);
          stroke-width: 1;
        }

        .axis-line {
          stroke: rgba(34, 37, 43, 0.2);
          stroke-width: 1.2;
        }

        .tick {
          font-size: 11px;
          fill: #6b6f78;
          text-anchor: end;
        }

        .month {
          font-size: 11px;
          fill: #6b6f78;
        }

        .bar {
          fill: #1f7a4d;
        }

        .bar.expense {
          fill: #b23a3a;
        }

        .net-line {
          stroke: #2e2f33;
          stroke-width: 2;
        }

        .net-point {
          fill: #2e2f33;
        }

        .hover-target {
          fill: transparent;
        }

        .tooltip {
          position: absolute;
          transform: translate(-50%, -100%);
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(34, 37, 43, 0.1);
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          color: #2d3138;
          pointer-events: none;
          box-shadow: 0 10px 20px rgba(20, 24, 36, 0.12);
          min-width: 160px;
        }

        .tooltip-title {
          margin: 0 0 6px;
          font-weight: 600;
          color: #2e2f33;
        }

        .tooltip p {
          margin: 0;
          line-height: 1.4;
        }

        .legend {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-size: 12px;
          color: #6b6f78;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .legend-swatch {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #1f7a4d;
        }

        .legend-swatch.expense {
          background: #b23a3a;
        }

        .legend-swatch.net {
          background: #2e2f33;
        }

        .chart-empty {
          margin: 0;
          color: #666a73;
        }
      `}</style>
    </div>
  );
}

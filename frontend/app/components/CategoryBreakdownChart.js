"use client";

import { useMemo, useRef, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const formatAmount = (value) => currencyFormatter.format(value);

const formatPercentage = (value) => `${value.toFixed(1)}%`;

const palette = [
  "#1f7a4d",
  "#b23a3a",
  "#2f6f9e",
  "#c4841a",
  "#0f8b8d",
  "#5f6b7a",
  "#7a9e7e",
  "#d1495b"
];

export default function CategoryBreakdownChart({ data }) {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const chartData = useMemo(
    () =>
      (data || []).map((item, index) => ({
        category: item.category || "Uncategorized",
        totalSpent: Number(item.total_spent || 0),
        percentage: Number(item.percentage_of_total || 0),
        color: palette[index % palette.length]
      })),
    [data]
  );

  const totalSpent = useMemo(
    () => chartData.reduce((sum, item) => sum + item.totalSpent, 0),
    [chartData]
  );

  const size = 240;
  const center = size / 2;
  const radius = 70;
  const stroke = 26;
  const circumference = 2 * Math.PI * radius;

  const chartSegments = useMemo(() => {
    let offset = 0;
    return chartData.map((item) => {
      const fraction = totalSpent > 0 ? item.totalSpent / totalSpent : 0;
      const length = circumference * fraction;
      const segment = { ...item, length, offset };
      offset += length;
      return segment;
    });
  }, [chartData, circumference, totalSpent]);

  const handleHover = (event, index) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    setTooltip({ index, x, y, width: bounds.width });
  };

  const handleFocus = (index) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    setTooltip({ index, x: bounds.width / 2, y: bounds.height / 2, width: bounds.width });
  };

  const handleLeave = () => setTooltip(null);

  const tooltipData =
    tooltip && chartData[tooltip.index] ? chartData[tooltip.index] : null;

  const tooltipStyle = tooltip
    ? {
        left: `${Math.min(Math.max(tooltip.x, 100), tooltip.width - 100)}px`,
        top: `${Math.max(tooltip.y - 12, 12)}px`
      }
    : {};

  if (!chartData.length || totalSpent <= 0) {
    return <p className="chart-empty">No expense data yet.</p>;
  }

  return (
    <div className="breakdown" ref={containerRef} onMouseLeave={handleLeave}>
      <div className="chart-row">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Expense breakdown">
          <g transform={`rotate(-90 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              className="ring"
              strokeWidth={stroke}
            />
            {chartSegments.map((segment, index) => (
              <circle
                key={`${segment.category}-${index}`}
                cx={center}
                cy={center}
                r={radius}
                className="segment"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                strokeDashoffset={-segment.offset}
                onMouseMove={(event) => handleHover(event, index)}
                onFocus={() => handleFocus(index)}
                tabIndex={0}
              />
            ))}
          </g>
          <text x={center} y={center - 4} textAnchor="middle" className="total-label">
            Total
          </text>
          <text x={center} y={center + 18} textAnchor="middle" className="total-value">
            {formatAmount(totalSpent)}
          </text>
        </svg>

        <div className="legend">
          {chartData.map((item, index) => (
            <div
              key={`${item.category}-${index}`}
              className="legend-row"
              onMouseMove={(event) => handleHover(event, index)}
              onMouseLeave={handleLeave}
              onFocus={() => handleFocus(index)}
              tabIndex={0}
              role="button"
            >
              <span className="swatch" style={{ background: item.color }} />
              <span className="label">{item.category}</span>
              <span className="percent">{formatPercentage(item.percentage)}</span>
            </div>
          ))}
        </div>
      </div>

      {tooltipData ? (
        <div className="tooltip" style={tooltipStyle}>
          <p className="tooltip-title">{tooltipData.category}</p>
          <p>{formatAmount(tooltipData.totalSpent)}</p>
        </div>
      ) : null}

      <style jsx>{`
        .breakdown {
          position: relative;
        }

        .chart-row {
          display: grid;
          grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
          gap: 24px;
          align-items: center;
        }

        svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .ring {
          fill: none;
          stroke: rgba(34, 37, 43, 0.08);
        }

        .segment {
          fill: none;
          cursor: pointer;
        }

        .total-label {
          font-size: 12px;
          fill: #6b6f78;
        }

        .total-value {
          font-size: 16px;
          font-weight: 600;
          fill: #2e2f33;
        }

        .legend {
          display: grid;
          gap: 12px;
        }

        .legend-row {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: #2d3138;
          outline: none;
        }

        .swatch {
          width: 12px;
          height: 12px;
          border-radius: 999px;
        }

        .label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .percent {
          font-variant-numeric: tabular-nums;
          color: #6b6f78;
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
          min-width: 140px;
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

        .chart-empty {
          margin: 0;
          color: #666a73;
        }

        @media (max-width: 700px) {
          .chart-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";

interface TimeRange {
  label: string;
  days: number;
}

const RANGES: TimeRange[] = [
  { label: "1周", days: 7 },
  { label: "2周", days: 14 },
  { label: "1月", days: 30 },
  { label: "3月", days: 90 },
  { label: "全部", days: 0 },
];

interface ChartDataPoint {
  date: string;
  label?: string;
  values: Record<string, number>;
}

interface ScrollableChartProps {
  data: ChartDataPoint[];
  metrics: { key: string; label: string; color: string }[];
  height?: number;
  barWidth?: number;
}

export function ScrollableChart({
  data,
  metrics,
  height = 120,
  barWidth = 14,
}: ScrollableChartProps) {
  const [selectedMetric, setSelectedMetric] = useState(metrics[0]?.key ?? "");
  const [selectedRange, setSelectedRange] = useState(1); // default 2W
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [selectedRange]);

  const rangeDays = RANGES[selectedRange].days;
  const filteredData =
    rangeDays > 0
      ? data.slice(-rangeDays)
      : data;

  const metric = metrics.find((m) => m.key === selectedMetric) ?? metrics[0];
  const values = filteredData.map((d) => d.values[metric.key] ?? 0);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const chartWidth = filteredData.length * (barWidth + 8) + 40;
  const chartH = height - 40; // top padding for labels

  return (
    <div className="space-y-2">
      {/* Metric selector */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {metrics.map((m) => (
          <button
            key={m.key}
            onClick={() => setSelectedMetric(m.key)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
              selectedMetric === m.key
                ? "text-white"
                : "text-zinc-400 bg-zinc-800/50 hover:bg-zinc-800"
            }`}
            style={
              selectedMetric === m.key
                ? { backgroundColor: m.color + "30", color: m.color }
                : {}
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Time range selector */}
      <div className="flex justify-center gap-1">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setSelectedRange(i)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              selectedRange === i
                ? "bg-zinc-700 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Scrollable chart */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide -mx-4 px-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <svg
          width={Math.max(chartWidth, 300)}
          height={height}
          viewBox={`0 0 ${Math.max(chartWidth, 300)} ${height}`}
          className="min-w-full"
        >
          {/* Y-axis ticks */}
          {[0, 0.5, 1].map((ratio) => {
            const y = 10 + chartH * (1 - ratio);
            const val = minVal + range * ratio;
            return (
              <g key={ratio}>
                <line
                  x1={30}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#27272a"
                  strokeWidth="0.5"
                  strokeDasharray="3 3"
                />
                <text
                  x={28}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px]"
                  fill="#52525b"
                >
                  {val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {filteredData.map((d, i) => {
            const v = d.values[metric.key] ?? 0;
            const barH = Math.max(2, ((v - minVal) / range) * chartH);
            const x = 40 + i * (barWidth + 8);
            const y = 10 + chartH - barH;

            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  fill={metric.color}
                  rx={1.5}
                  opacity={0.85}
                />
                {/* Date label - show every Nth to avoid overlap */}
                {i % Math.max(1, Math.floor(filteredData.length / 7)) === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={height - 6}
                    textAnchor="middle"
                    className="text-[8px]"
                    fill="#52525b"
                  >
                    {d.date.slice(5)}
                  </text>
                )}
                {/* Value label on top */}
                {filteredData.length <= 20 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 3}
                    textAnchor="middle"
                    className="text-[8px]"
                    fill={metric.color}
                  >
                    {v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

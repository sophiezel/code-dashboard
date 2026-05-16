"use client";

import { useState, useCallback } from "react";
import { CombinedChart, MiniSparkline } from "@/components/mobile/combined-chart";
import { Activity, Calendar } from "lucide-react";

interface SentimentClientProps {
  chartData: { date: string; values: Record<string, number> }[];
  latest: {
    date: string;
    score: number;
    limit_up_count: number;
    limit_up_rate: number;
  } | null;
  latestDetails: Record<string, unknown> | null;
}

const PRESET_WINDOWS = [
  { label: "1周", days: 5 },
  { label: "2周", days: 10 },
  { label: "1月", days: 22 },
  { label: "3月", days: 66 },
  { label: "半年", days: 132 },
  { label: "1年", days: 252 },
];

function fmtInt(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(Math.round(v));
}

function shiftRange(start: string, end: string, direction: 1 | -1): [string, string] {
  const s = new Date(start);
  const e = new Date(end);
  const span = e.getTime() - s.getTime();
  const ns = new Date(s.getTime() + direction * span);
  const ne = new Date(e.getTime() + direction * span);
  return [ns.toISOString().slice(0, 10), ne.toISOString().slice(0, 10)];
}

const KEY_METRICS = [
  { key: "涨停家数", label: "涨停", color: "#10b981" },
  { key: "跌停家数", label: "跌停", color: "#ef4444" },
] as const;

const VOLUME_METRICS = [
  { key: "上涨家数", label: "上涨", color: "#22c55e" },
  { key: "下跌家数", label: "下跌", color: "#dc2626" },
] as const;

export function SentimentClient({
  chartData,
  latest,
  latestDetails,
}: SentimentClientProps) {
  const [windowDays, setWindowDays] = useState(10);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [visibleRange, setVisibleRange] = useState<{ start: string; end: string } | null>(null);

  let filteredData = chartData;
  if (showCustom) {
    const start = customStart || chartData[0]?.date || "";
    const end = customEnd || chartData[chartData.length - 1]?.date || "";
    filteredData = chartData.filter((d) => d.date >= start && d.date <= end);
  } else if (windowDays > 0) {
    filteredData = chartData.slice(-windowDays);
  }

  const sentimentColor =
    latest && latest.score >= 60
      ? "#10b981"
      : latest && latest.score >= 40
      ? "#f59e0b"
      : "#ef4444";

  const tradingDays = filteredData.length;

  const handleVisibleChange = useCallback(
    (firstIdx: number, lastIdx: number, totalLen: number) => {
      if (totalLen > 0) {
        const start = chartData[Math.max(0, firstIdx)]?.date ?? "";
        const end = chartData[Math.min(totalLen - 1, lastIdx)]?.date ?? "";
        setVisibleRange(start && end ? { start, end } : null);
        if (showCustom && start && end) {
          if (start < (customStart || start) || end > (customEnd || end)) {
            setCustomStart(start);
            setCustomEnd(end);
          }
        }
      }
    },
    [chartData, showCustom, customStart, customEnd]
  );

  if (!latest) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Activity className="w-10 h-10 text-zinc-700 mb-3" />
        <p className="text-sm text-zinc-500">暂无情绪数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center shrink-0">
          <Activity className="w-3 h-3 text-white" />
        </div>
        <h1 className="text-sm font-bold">市场情绪</h1>
        <span className="text-[10px] text-zinc-500 ml-auto">{latest.date.slice(5)}</span>
      </div>

      {/* Compact hero */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color: sentimentColor }}>
          {latest.score}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-zinc-400">
            {latest.score >= 60 ? "🟢 乐观" : latest.score >= 40 ? "🟡 中性" : "🔴 悲观"}
          </p>
          <div className="flex gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-500">
              涨停 <span className="text-emerald-400 font-bold">{latest.limit_up_count}</span>
            </span>
            <span className="text-[10px] text-zinc-500">
              率 <span className="text-amber-400 font-bold">{(latest.limit_up_rate * 100).toFixed(1)}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* Mini sparklines */}
      {chartData.length >= 2 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 divide-y divide-zinc-800/50">
          <MiniSparkline data={filteredData.map((d) => d.values.涨停家数)} color="#10b981" label="涨停家数" value={fmtInt(latest.limit_up_count)} />
          <MiniSparkline data={filteredData.map((d) => d.values.炸板率)} color="#f59e0b" label="炸板率" value={`${((latestDetails?.["炸板率"] as number) * 100)?.toFixed(1) ?? "--"}%`} />
          <MiniSparkline data={filteredData.map((d) => d.values.涨跌比)} color="#3b82f6" label="涨跌比" value={(latestDetails?.["涨跌比"] as number)?.toFixed(2) ?? "--"} />
        </div>
      )}

      {/* Time range control */}
      <div className="space-y-1">
        <div className="flex items-center gap-0.5 flex-wrap">
          {PRESET_WINDOWS.map((w) => (
            <button
              key={w.label}
              onClick={() => { setWindowDays(w.days); setShowCustom(false); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                !showCustom && windowDays === w.days
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {w.label}
            </button>
          ))}
          <button
            onClick={() => {
              if (!showCustom) {
                setCustomStart(chartData[0]?.date ?? "");
                setCustomEnd(chartData[chartData.length - 1]?.date ?? "");
              }
              setShowCustom(!showCustom);
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              showCustom ? "bg-violet-500/20 text-violet-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            全部
          </button>
          <span className="text-[9px] text-zinc-500 ml-1">{tradingDays}个交易日</span>
        </div>

        {showCustom && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick presets */}
            {[
              { label: "本月", fn: () => {
                const now = new Date();
                setCustomStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10));
                setCustomEnd(now.toISOString().slice(0,10));
              }},
              { label: "本季", fn: () => {
                const now = new Date();
                const q = Math.floor(now.getMonth() / 3);
                setCustomStart(new Date(now.getFullYear(), q*3, 1).toISOString().slice(0,10));
                setCustomEnd(now.toISOString().slice(0,10));
              }},
              { label: "本年", fn: () => {
                const now = new Date();
                setCustomStart(new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10));
                setCustomEnd(now.toISOString().slice(0,10));
              }},
              { label: "近半年", fn: () => {
                const now = new Date();
                const d = new Date(now);
                d.setMonth(d.getMonth() - 6);
                setCustomStart(d.toISOString().slice(0,10));
                setCustomEnd(now.toISOString().slice(0,10));
              }},
            ].map(p => (
              <button key={p.label} onClick={p.fn}
                className="px-1.5 py-0.5 rounded text-[9px] text-zinc-500 bg-zinc-800/30 hover:bg-zinc-700/50 hover:text-zinc-300 transition-colors shrink-0"
              >{p.label}</button>
            ))}

            {/* Compact date inputs — inline */}
            <div className="flex items-center gap-0.5 bg-zinc-800/50 rounded-md pl-1.5 pr-1 py-1 border border-zinc-700/50">
              <Calendar className="w-3 h-3 text-zinc-500 shrink-0" />
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-[10px] text-zinc-200 w-[104px] text-center [color-scheme:dark] appearance-none"
                max={customEnd || undefined} />
              <span className="text-zinc-600 text-[9px] shrink-0">→</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-[10px] text-zinc-200 w-[104px] text-center [color-scheme:dark] appearance-none"
                min={customStart || undefined} />
            </div>
          </div>
        )}

        {visibleRange && showCustom && (
          <div className="text-[9px] text-zinc-500 text-center">
            查看: {visibleRange.start} → {visibleRange.end}
          </div>
        )}
      </div>

      {/* Charts */}
      {chartData.length >= 2 && (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <CombinedChart data={chartData} metrics={[...KEY_METRICS]} height={90}
              windowDays={windowDays}
              customStart={showCustom ? customStart : undefined} customEnd={showCustom ? customEnd : undefined}
              formatValue={fmtInt} onWindowChange={setWindowDays} onVisibleRangeChange={handleVisibleChange} />
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <CombinedChart data={chartData} metrics={[...VOLUME_METRICS]} height={90}
              windowDays={windowDays}
              customStart={showCustom ? customStart : undefined} customEnd={showCustom ? customEnd : undefined}
              formatValue={fmtInt} onWindowChange={setWindowDays} onVisibleRangeChange={handleVisibleChange} />
          </div>
        </>
      )}

      {/* Detail grid */}
      {latestDetails && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {Object.entries(latestDetails).map(([key, value]) => (
              <div key={key} className="text-center p-1.5 rounded-lg bg-zinc-800/30">
                <span className="text-[8px] text-zinc-500 block truncate">{key}</span>
                <span className="text-[11px] font-bold tabular-nums text-zinc-200">
                  {typeof value === "number"
                    ? key.includes("率") || key.includes("比") || key.includes("溢价")
                      ? `${(value * 100).toFixed(1)}%`
                      : Number.isInteger(value) ? String(value) : value.toFixed(2)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

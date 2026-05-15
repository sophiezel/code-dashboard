"use client";

import { useState } from "react";
import { HeroCard } from "@/components/mobile/hero-card";
import { KpiGrid } from "@/components/mobile/kpi-grid";
import { IndexBar } from "@/components/mobile/index-bar";
import { ReportRow } from "@/components/mobile/report-row";
import { SparklineChart } from "@/components/mobile/sparkline";
import { MacroRing } from "@/components/mobile/macro-ring";
import {
  TrendingUp, Zap, ShieldAlert, Activity, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportSummary {
  id: number; type: string; title: string; preview: string; created_at: string;
}

interface Props {
  macroScore: number | null;
  macroPosition: number | null;
  macroDate: string | null;
  indicatorKeys: string[];
  indicatorValues: number[];
  sentimentScore: number | null;
  sentimentLimitUp: number;
  sentimentLimitUpRate: number;
  detailKeys: string[];
  detailValues: string[];
  recentReports: ReportSummary[];
  latestPicks: ReportSummary | null;
  latestBuy: ReportSummary | null;
  latestReview: ReportSummary | null;
  macroChartData: number[];
  sentimentChartData: number[];
}

type SlideTab = "macro" | "sentiment";

export function MobileDashboardClient(props: Props) {
  const {
    macroScore, macroPosition,
    indicatorKeys, indicatorValues,
    sentimentScore, sentimentLimitUp, sentimentLimitUpRate,
    detailKeys, detailValues,
    recentReports, latestPicks, latestBuy, latestReview,
    macroChartData, sentimentChartData,
  } = props;

  const [activeTab, setActiveTab] = useState<SlideTab>("macro");

  const sentimentColor =
    sentimentScore !== null && sentimentScore >= 60 ? "#10b981"
    : sentimentScore !== null && sentimentScore >= 40 ? "#f59e0b"
    : "#ef4444";

  // Build KPI detail component
  const kpiDetail = detailKeys.length > 0 ? (
    <div className="space-y-1">
      {detailKeys.slice(0, 6).map((key, i) => (
        <div key={key} className="flex justify-between text-[11px]">
          <span className="text-zinc-500">{key}</span>
          <span className="text-zinc-300 tabular-nums font-medium">{detailValues[i] ?? ""}</span>
        </div>
      ))}
    </div>
  ) : undefined;

  // Build indicator cells for macro tab
  const macroIndicatorCells = indicatorKeys.length > 0 ? (
    <div className="grid grid-cols-3 gap-2">
      {indicatorKeys.map((key, i) => (
        <div key={key} className="rounded-lg bg-zinc-800/50 p-2 text-center">
          <span className="text-[9px] text-zinc-500 uppercase block">{key}</span>
          <span className="text-sm font-bold tabular-nums text-zinc-200">
            {indicatorValues[i]?.toFixed(1) ?? "—"}
          </span>
        </div>
      ))}
    </div>
  ) : null;

  // Build detail cells for sentiment tab
  const sentimentDetailCells = detailKeys.length > 0 ? (
    <div className="grid grid-cols-2 gap-2">
      {detailKeys.slice(0, 6).map((key, i) => (
        <div key={key} className="rounded-lg bg-zinc-800/50 p-2">
          <span className="text-[9px] text-zinc-500 block">{key}</span>
          <span className="text-sm font-bold tabular-nums text-zinc-200">{detailValues[i] ?? "—"}</span>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className="space-y-4 pb-2">
      <HeroCard
        macroScore={macroScore}
        macroPosition={macroPosition}
        sentimentScore={sentimentScore}
        sentimentLabel={
          sentimentScore !== null
            ? sentimentScore >= 60 ? "乐观" : sentimentScore >= 40 ? "中性" : "悲观"
            : undefined
        }
      />

      <IndexBar />

      <KpiGrid
        items={[
          {
            icon: <TrendingUp className="w-4 h-4" />,
            label: "宏观评分",
            value: macroScore !== null ? macroScore.toFixed(0) : "--",
            subtitle: `仓位${macroPosition !== null ? (macroPosition * 100).toFixed(0) : "--"}%`,
            color: "emerald" as const,
          },
          {
            icon: <Zap className="w-4 h-4" />,
            label: "涨停家数",
            value: sentimentLimitUp,
            subtitle: `${(sentimentLimitUpRate * 100).toFixed(1)}%`,
            color: "amber" as const,
          },
          {
            icon: <ShieldAlert className="w-4 h-4" />,
            label: "持仓建议",
            value: macroPosition !== null ? `${(macroPosition * 100).toFixed(0)}%` : "--",
            subtitle: latestReview ? "已复盘" : "待复盘",
            color: "violet" as const,
          },
          {
            icon: <Activity className="w-4 h-4" />,
            label: "情绪指数",
            value: sentimentScore ?? "--",
            subtitle: sentimentScore !== null
              ? sentimentScore >= 60 ? "🟢 乐观" : sentimentScore >= 40 ? "🟡 中性" : "🔴 悲观"
              : "--",
            color: (sentimentScore !== null
              ? sentimentScore >= 60 ? "emerald" : sentimentScore >= 40 ? "amber" : "rose"
              : "blue") as "emerald" | "amber" | "rose" | "blue",
            detail: kpiDetail,
          },
        ]}
      />

      {/* Slide Tabs */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 overflow-hidden">
        <div className="flex border-b border-zinc-800/60">
          {(["macro", "sentiment"] as SlideTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-3 text-xs font-semibold transition-colors relative",
                activeTab === tab ? "text-emerald-400" : "text-zinc-500"
              )}
            >
              {tab === "macro" ? "宏观评分" : "市场情绪"}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === "macro" && (
            <div className="space-y-3">
              {macroScore !== null ? (
                <>
                  <div className="flex items-center gap-3">
                    <MacroRing score={macroScore} size={56} strokeWidth={5} />
                    <div>
                      <p className="text-xs text-zinc-500">最新评分</p>
                      <p className="text-xl font-bold text-emerald-400 tabular-nums">
                        {macroScore.toFixed(0)}
                        <span className="text-xs text-zinc-500 font-normal">/100</span>
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-zinc-500">建议仓位</p>
                      <p className="text-lg font-bold text-amber-400 tabular-nums">
                        {macroPosition !== null ? (macroPosition * 100).toFixed(0) : "—"}%
                      </p>
                    </div>
                  </div>
                  {macroIndicatorCells}
                  {macroChartData.length >= 2 && (
                    <SparklineChart data={macroChartData} color="#10b981" height={48} className="w-full h-12" />
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-4">暂无宏观数据</p>
              )}
            </div>
          )}

          {activeTab === "sentiment" && (
            <div className="space-y-3">
              {sentimentScore !== null ? (
                <>
                  <div className="flex items-center gap-3">
                    <MacroRing score={sentimentScore} size={56} strokeWidth={5} color={sentimentColor} />
                    <div>
                      <p className="text-xs text-zinc-500">情绪指数</p>
                      <p className="text-xl font-bold tabular-nums" style={{ color: sentimentColor }}>
                        {sentimentScore}
                        <span className="text-xs text-zinc-500 font-normal">/100</span>
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-zinc-500">涨停/涨停率</p>
                      <p className="text-lg font-bold tabular-nums text-emerald-400">
                        {sentimentLimitUp}
                        <span className="text-xs text-zinc-500 font-normal">
                          /{(sentimentLimitUpRate * 100).toFixed(1)}%
                        </span>
                      </p>
                    </div>
                  </div>
                  {sentimentDetailCells}
                  {sentimentChartData.length >= 2 && (
                    <SparklineChart data={sentimentChartData} color={sentimentColor} height={48} className="w-full h-12" />
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-4">暂无情绪数据</p>
              )}
            </div>
          )}
        </div>
      </div>

      {(latestPicks || latestBuy) && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">最新信号</span>
          </div>
          <div className="space-y-2">
            {latestPicks && <ReportRow {...latestPicks} />}
            {latestBuy && <ReportRow {...latestBuy} />}
          </div>
        </div>
      )}

      {latestReview && (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.03] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest">持仓复盘</span>
          </div>
          <ReportRow {...latestReview} />
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">最近报告</h2>
        {recentReports.length === 0 ? (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-8 text-center">
            <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">暂无报告</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentReports.map((r) => (
              <ReportRow key={r.id} {...r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { ModuleCard } from "@/components/mobile/module-card";
import { cn } from "@/lib/utils";
import { Shield, AlertTriangle, TrendingDown, Activity } from "lucide-react";
import type { RiskOverview, RiskEvent } from "@/lib/types";

interface Props {
  overview: RiskOverview | null;
  events: RiskEvent[];
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    case "warning": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "info": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
  }
}

function severityDot(severity: string): string {
  switch (severity) {
    case "critical": return "bg-rose-400";
    case "warning": return "bg-amber-400";
    case "info": return "bg-blue-400";
    default: return "bg-zinc-400";
  }
}

export function RiskClient({ overview, events }: Props) {
  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-rose-400" />
        <h1 className="text-sm font-bold text-zinc-100">统一风控</h1>
      </div>

      {/* Overview card */}
      {overview ? (
        <ModuleCard
          label="风控概览" title={`更新 ${overview.update_time?.slice(0, 10) ?? "--"}`}
          accent="rose"
          icon={<Shield className="w-3.5 h-3.5 text-rose-400" />}
          body={
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "总回撤", value: `${overview.total_drawdown_pct.toFixed(2)}%`, color: overview.total_drawdown_pct < -15 ? "rose" as const : overview.total_drawdown_pct < -10 ? "amber" as const : "emerald" as const },
                { label: "当前回撤", value: `${overview.current_drawdown_pct.toFixed(2)}%`, color: overview.current_drawdown_pct < -10 ? "rose" as const : overview.current_drawdown_pct < -5 ? "amber" as const : "emerald" as const },
                { label: "VaR(95%)", value: `${(overview.var_95 * 100).toFixed(2)}%`, color: overview.var_95 > 0.03 ? "rose" as const : overview.var_95 > 0.02 ? "amber" as const : "emerald" as const },
                { label: "波动率", value: `${(overview.volatility * 100).toFixed(2)}%`, color: overview.volatility > 0.3 ? "rose" as const : overview.volatility > 0.2 ? "amber" as const : "emerald" as const },
                { label: "Sharpe", value: overview.sharpe.toFixed(2), color: overview.sharpe > 1.5 ? "emerald" as const : overview.sharpe > 0.8 ? "amber" as const : "rose" as const },
                { label: "最大连亏", value: `${overview.max_consecutive_losses}天`, color: overview.max_consecutive_losses > 7 ? "rose" as const : overview.max_consecutive_losses > 4 ? "amber" as const : "emerald" as const },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-zinc-800/30">
                  <span className="text-[9px] text-zinc-500">{item.label}</span>
                  <span className={cn("text-[10px] font-semibold tabular-nums", 
                    item.color === "emerald" ? "text-emerald-400" : item.color === "amber" ? "text-amber-400" : "text-rose-400"
                  )}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          }
        />
      ) : (
        <div className="rounded-2xl border border-zinc-800/80 p-6 text-center">
          <p className="text-[10px] text-zinc-500">暂无风控数据</p>
        </div>
      )}

      {/* Events */}
      <ModuleCard
        label="风控事件" title={`最近 ${events.length} 条`}
        accent="rose"
        icon={<AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
        body={
          <div className="space-y-1">
            {events.map((evt) => (
              <div
                key={evt.id}
                className={cn(
                  "flex items-start gap-2 px-2 py-1.5 rounded-lg border text-[10px]",
                  severityColor(evt.severity)
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1 shrink-0", severityDot(evt.severity))} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400 tabular-nums">{evt.date}</span>
                    <span className="font-medium text-zinc-200">{evt.type}</span>
                    {evt.symbol && <span className="text-zinc-500">{evt.symbol}</span>}
                  </div>
                  <p className="text-zinc-500 mt-0.5">{evt.message}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-zinc-600">值: {evt.metric_value.toFixed(2)}</span>
                    <span className="text-zinc-600">阈值: {evt.threshold.toFixed(2)}</span>
                    {evt.acknowledged === 0 && (
                      <span className="text-rose-400 text-[9px]">未确认</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-[10px] text-zinc-500 text-center py-2">暂无风控事件</p>
            )}
          </div>
        }
      />
    </div>
  );
}

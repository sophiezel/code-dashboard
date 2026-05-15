import { getSentimentHistory, getLatestSentiment } from "@/lib/db";
import { MacroRing } from "@/components/mobile/macro-ring";
import { SparklineChart } from "@/components/mobile/sparkline";
import { Activity, TrendingUp, Flame } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function MobileSentimentPage() {
  const history = await getSentimentHistory(60);
  const latest = await getLatestSentiment();

  const chartData = [...history].reverse();
  const scoreValues = chartData.map((s) => s.score);

  const sentimentColor =
    latest && latest.score >= 60
      ? "#10b981"
      : latest && latest.score >= 40
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">市场情绪</h1>

      {latest ? (
        <>
          {/* Hero gauge */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center gap-4">
              <MacroRing score={latest.score} size={80} strokeWidth={6} color={sentimentColor} />
              <div className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: sentimentColor }}
                  >
                    {latest.score}
                  </span>
                  <span className="text-sm text-zinc-500">/100</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  {latest.score >= 60 ? "🟢 乐观" : latest.score >= 40 ? "🟡 中性" : "🔴 悲观"}
                </p>
              </div>
            </div>

            {/* Key numbers */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <p className="text-[10px] text-zinc-500 mb-0.5">涨停</p>
                <p className="text-lg font-bold tabular-nums text-emerald-400">
                  {latest.limit_up_count}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <p className="text-[10px] text-zinc-500 mb-0.5">涨停率</p>
                <p className="text-lg font-bold tabular-nums text-amber-400">
                  {(latest.limit_up_rate * 100).toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-zinc-800/50">
                <p className="text-[10px] text-zinc-500 mb-0.5">日期</p>
                <p className="text-sm font-bold tabular-nums text-zinc-300">
                  {latest.date.slice(5)}
                </p>
              </div>
            </div>
          </div>

          {/* Details */}
          {latest.details && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-medium text-zinc-400">详细数据</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(latest.details).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5"
                  >
                    <span className="text-[9px] text-zinc-500 block mb-0.5">{key}</span>
                    <span className="text-sm font-bold tabular-nums text-zinc-200">
                      {typeof value === "number"
                        ? key.includes("率") || key.includes("比") || key.includes("溢价")
                          ? `${(value * 100).toFixed(1)}%`
                          : value % 1 === 0
                          ? String(value)
                          : value.toFixed(2)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trend sparkline */}
          {scoreValues.length >= 2 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-medium text-zinc-400">情绪趋势</span>
              </div>
              <SparklineChart data={scoreValues} color={sentimentColor} height={50} className="w-full h-12" />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Flame className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">暂无情绪数据</p>
        </div>
      )}
    </div>
  );
}

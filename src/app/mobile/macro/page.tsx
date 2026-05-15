import { getMacroScores, getLatestMacroScore } from "@/lib/db";
import { MacroRing } from "@/components/mobile/macro-ring";
import { SparklineChart } from "@/components/mobile/sparkline";
import { TrendingUp, DollarSign, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default async function MobileMacroPage() {
  const scores = await getMacroScores(60);
  const latest = await getLatestMacroScore();

  const chartData = [...scores].reverse();
  const scoreValues = chartData.map((s) => s.score);
  const positionValues = chartData.map((s) => s.position * 100);

  const latestIndicators = latest?.indicators || null;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">宏观评分</h1>

      {latest ? (
        <>
          {/* Hero gauge */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center gap-4">
              <MacroRing score={latest.score} size={80} strokeWidth={6} />
              <div className="flex-1">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold tabular-nums text-emerald-400">
                    {latest.score.toFixed(0)}
                  </span>
                  <span className="text-sm text-zinc-500">/100</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-sm font-medium text-zinc-300">
                    仓位 {(latest.position * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">{latest.date}</p>
              </div>
            </div>

            {/* Position bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                <span>空仓</span>
                <span>半仓</span>
                <span>满仓</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full transition-all"
                  style={{ width: `${latest.position * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Trend sparkline */}
          {scoreValues.length >= 2 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-400">评分趋势</span>
                <span className="text-[10px] text-zinc-600 ml-auto">
                  {chartData[0]?.date} → {chartData[chartData.length - 1]?.date}
                </span>
              </div>
              <SparklineChart data={scoreValues} color="#10b981" height={50} className="w-full h-12" />
            </div>
          )}

          {/* Indicators grid */}
          {latestIndicators && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-medium text-zinc-400">分项指标</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(latestIndicators).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 text-center"
                  >
                    <span className="text-[9px] text-zinc-500 uppercase block mb-1">
                      {key}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-zinc-200">
                      {typeof value === "number" ? value.toFixed(1) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position trend */}
          {positionValues.length >= 2 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <span className="text-xs font-medium text-zinc-400 block mb-2">仓位建议趋势</span>
              <SparklineChart data={positionValues} color="#f59e0b" height={40} className="w-full h-10" />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-500">暂无宏观数据</p>
        </div>
      )}
    </div>
  );
}

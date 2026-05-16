import { getHsgtHistory, getMarginHistory } from "@/lib/db";
import { SparklineChart } from "@/components/mobile/sparkline";
import { BarChart } from "@/components/mobile/bar-chart";
import { DollarSign, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export default function MobileFlowPage() {
  const hsgt = [...getHsgtHistory(60)].reverse();
  const margin = [...getMarginHistory(60)].reverse();

  const southValues = hsgt.map((r: any) => r.net_buy);
  const marginValues = margin.map((r: any) => r.margin_balance / 1e8);

  const latestHsgt = hsgt[hsgt.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center shrink-0">
          <DollarSign className="w-3 h-3 text-white" />
        </div>
        <h1 className="text-sm font-bold">资金流向</h1>
      </div>

      {/* 南向资金 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium text-zinc-400">南向资金净买入</span>
          {latestHsgt && (
            <span className={`text-[10px] ml-auto font-bold ${latestHsgt.net_buy >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {latestHsgt.net_buy >= 0 ? "+" : ""}{(latestHsgt.net_buy / 1e8).toFixed(2)}亿
            </span>
          )}
        </div>
        {southValues.length >= 2 && (
          <BarChart data={southValues.slice(-30)} color="#f59e0b" height={60} className="w-full h-14" />
        )}
        <span className="text-[9px] text-zinc-600 mt-1 block">{hsgt.length} 个交易日</span>
      </div>

      {/* 融资余额 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-zinc-400">融资余额趋势</span>
          <span className="text-[10px] ml-auto font-bold text-zinc-300">
            {margin.length > 0 ? (margin[margin.length-1].margin_balance / 1e8).toFixed(0) + "亿" : "--"}
          </span>
        </div>
        {marginValues.length >= 2 && (
          <SparklineChart data={marginValues.slice(-60)} color="#3b82f6" height={50} className="w-full h-12" />
        )}
        <span className="text-[9px] text-zinc-600 mt-1 block">{margin.length} 个交易日</span>
      </div>
    </div>
  );
}

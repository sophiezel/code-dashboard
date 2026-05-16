import { getThemePool, getScreenerDb } from "@/lib/db";
import { headers } from "next/headers";
import { isSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function MobilePicksPage() {
  const h = await headers();
  const role = h.get("X-User-Role") || "guest";
  if (!isSuperAdmin(role)) {
    return <div className="p-8 text-center text-zinc-500">无权访问</div>;
  }

  const themes = getThemePool();
  const seen = new Set<string>();

  const longTermStocks = themes.flatMap(t =>
    t.stocks.filter(s => {
      const match = s.source?.includes("鳄鱼派核心") || s.source?.includes("标准池-龙头");
      if (match && !seen.has(s.symbol)) { seen.add(s.symbol); return true; }
      return false;
    })
  ).slice(0, 8);

  const shortTermStocks = themes.flatMap(t =>
    t.stocks.filter(s => {
      const match = s.source?.includes("鳄鱼派-新开") || s.source?.includes("鳄鱼派-波段") || s.source?.includes("鳄鱼派-低位");
      if (match && !seen.has(s.symbol)) { seen.add(s.symbol); return true; }
      return false;
    })
  ).slice(0, 8);

  const quantStocks = (() => {
    try {
      const db = getScreenerDb();
      return db.prepare(
        "SELECT symbol, name, score, pe, rsi, volume_ratio FROM screen_results WHERE screen_date=(SELECT MAX(screen_date) FROM screen_results) AND score>=8 ORDER BY score DESC LIMIT 6"
      ).all() as any[];
    } catch { return []; }
  })();

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">荐股列表</h1>

      {/* Long-term */}
      <div className="rounded-xl border border-amber-800/30 bg-gradient-to-b from-amber-950/20 to-zinc-950 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="text-xs font-semibold text-amber-400">长线投资</span>
        </div>
        {longTermStocks.map((s) => (
          <div key={s.symbol} className="py-1.5 border-b border-zinc-800/30 last:border-0 flex items-center gap-2 text-xs">
            <span className="font-mono text-zinc-500 w-16 shrink-0">{s.symbol}</span>
            <span className="text-zinc-200 flex-1">{s.name}</span>
            <span className={`tabular-nums ${s.change_pct > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {s.change_pct > 0 ? "+" : ""}{s.change_pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Short-term */}
      <div className="rounded-xl border border-emerald-800/30 bg-gradient-to-b from-emerald-950/20 to-zinc-950 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400">短线投机</span>
        </div>
        {shortTermStocks.map((s) => (
          <div key={s.symbol} className="py-1.5 border-b border-zinc-800/30 last:border-0 flex items-center gap-2 text-xs">
            <span className="font-mono text-zinc-500 w-16 shrink-0">{s.symbol}</span>
            <div className="flex-1 min-w-0">
              <span className="text-zinc-200">{s.name}</span>
              {s.comment && <span className="text-[9px] text-emerald-400/70 ml-1 truncate">{s.comment.slice(0, 30)}</span>}
            </div>
            <span className={`tabular-nums ${s.change_pct > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {s.change_pct > 0 ? "+" : ""}{s.change_pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Quant picks */}
      <div className="rounded-xl border border-violet-800/30 bg-gradient-to-b from-violet-950/20 to-zinc-950 p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="text-xs font-semibold text-violet-400">量化补遗</span>
        </div>
        {quantStocks.map((s: any) => (
          <div key={s.symbol} className="py-1.5 border-b border-zinc-800/30 last:border-0 flex items-center gap-2 text-xs">
            <span className="font-mono text-zinc-500 w-16 shrink-0">{s.symbol}</span>
            <span className="text-zinc-200 flex-1">{s.name}</span>
            <span className="text-violet-400 tabular-nums">{s.score?.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

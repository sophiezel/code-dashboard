import { getThemePool } from "@/lib/db";
import { headers } from "next/headers";
import { isSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function MobileSectorsPage() {
  const h = await headers();
  const role = h.get("X-User-Role") || "guest";
  if (!isSuperAdmin(role)) {
    return <div className="p-8 text-center text-zinc-500">无权访问</div>;
  }

  const themes = getThemePool();

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">板块地图</h1>

      {themes.map((theme) => {
        const crocStocks = theme.stocks.filter(s => s.source?.includes("鳄鱼派"));
        const segments = new Map<string, typeof theme.stocks>();
        for (const s of theme.stocks) {
          const seg = s.segment || "未分类";
          if (!segments.has(seg)) segments.set(seg, []);
          segments.get(seg)!.push(s);
        }

        return (
          <details key={theme.theme} className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden" open>
            <summary className="flex items-center gap-2 p-3 text-sm list-none">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span className="font-semibold text-zinc-200">{theme.theme}</span>
              <span className="text-xs text-zinc-500 ml-auto">{theme.stocks.length}只 {crocStocks.length > 0 ? `· 鳄鱼派${crocStocks.length}` : ""}</span>
            </summary>

            <div className="divide-y divide-zinc-800/50">
              {Array.from(segments.entries()).map(([segName, stocks]) => (
                <div key={segName} className="p-2.5">
                  <span className="text-[10px] text-zinc-500 block mb-1.5">{segName} ({stocks.length})</span>
                  {stocks[0]?.comment && (
                    <div className="mb-2 p-2 rounded bg-amber-500/5 text-[9px] text-zinc-400">{stocks[0].comment}</div>
                  )}
                  <div className="space-y-1">
                    {stocks.map((s) => (
                      <div key={s.symbol} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-zinc-500 w-14 shrink-0">{s.symbol}</span>
                        <span className="text-zinc-200 truncate flex-1">{s.name}</span>
                        <span className={`tabular-nums font-mono shrink-0 ${s.change_pct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {s.change_pct > 0 ? "+" : ""}{s.change_pct.toFixed(1)}%
                        </span>
                        {s.source && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 shrink-0">
                            {s.source.length > 4 ? s.source.slice(0, 4) + ".." : s.source}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

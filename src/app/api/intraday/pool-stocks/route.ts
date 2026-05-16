import { NextResponse } from "next/server";
import { getScreenerDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getScreenerDb();

  // 推荐池: 从 theme_pool_stocks 取最新
  const poolStocks = db.prepare(
    "SELECT theme, segment, symbol, name, price, change_pct, volume, source, comment FROM theme_pool_stocks ORDER BY theme, change_pct DESC LIMIT 50"
  ).all() as any[];

  // 量化筛选结果 (最新)
  const quantStocks = db.prepare(
    "SELECT symbol, name, score, pe, rsi, volume_ratio FROM screen_results WHERE screen_date = (SELECT MAX(screen_date) FROM screen_results) ORDER BY score DESC LIMIT 20"
  ).all() as any[];

  // 最新交易日
  const lastDate = db.prepare(
    "SELECT MAX(trade_date) as d FROM stock_daily_all"
  ).get() as any;

  // 按 theme 分组
  const themeMap = new Map<string, any[]>();
  for (const s of poolStocks) {
    if (!themeMap.has(s.theme)) themeMap.set(s.theme, []);
    themeMap.get(s.theme)!.push(s);
  }

  return NextResponse.json({
    tradeDate: lastDate?.d || null,
    pools: Array.from(themeMap.entries()).map(([theme, stocks]) => ({ theme, stocks })),
    quantPicks: quantStocks,
  });
}

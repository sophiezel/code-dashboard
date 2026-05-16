import { NextResponse } from "next/server";
import { getScreenerDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getScreenerDb();

  // 行业板块资金: 从 theme_pool_stocks 分组计算
  const themeData = db.prepare(
    "SELECT theme, segment, symbol, name, price, change_pct, volume FROM theme_pool_stocks ORDER BY theme, change_pct DESC"
  ).all() as any[];

  // 按theme聚合
  const themeAgg: Record<string, { theme: string; count: number; avgChange: number; totalVolume: number; stocks: any[] }> = {};
  for (const s of themeData) {
    if (!themeAgg[s.theme]) {
      themeAgg[s.theme] = { theme: s.theme, count: 0, avgChange: 0, totalVolume: 0, stocks: [] };
    }
    themeAgg[s.theme].count++;
    themeAgg[s.theme].avgChange += s.change_pct;
    themeAgg[s.theme].totalVolume += s.volume || 0;
    themeAgg[s.theme].stocks.push(s);
  }

  const sectors = Object.values(themeAgg).map(g => ({
    ...g,
    avgChange: +(g.avgChange / g.count).toFixed(2),
    totalVolume: Math.round(g.totalVolume),
    topStocks: g.stocks.slice(0, 3),
  })).sort((a, b) => b.avgChange - a.avgChange);

  // 行业板块资金流向: 从 stock_fund_flow 聚合
  const fundFlow = db.prepare(`
    SELECT s.symbol, s.name, f.net_inflow, f.main_force_inflow 
    FROM stock_fund_flow f 
    JOIN stock_basic s ON s.symbol = f.symbol
    WHERE f.trade_date = (SELECT MAX(trade_date) FROM stock_fund_flow)
    ORDER BY ABS(f.net_inflow) DESC LIMIT 20
  `).all() as any[];

  return NextResponse.json({
    sectors,
    fundFlow,
  });
}

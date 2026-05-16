import { NextRequest, NextResponse } from "next/server";
import { getScreenerDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  }

  const db = getScreenerDb();

  // 日K线历史
  const daily = db.prepare(
    "SELECT trade_date, open, high, low, close, volume, amount FROM stock_daily_all WHERE symbol = ? ORDER BY trade_date DESC LIMIT 60"
  ).all(symbol) as any[];

  // 基本面概要
  const fundamental = db.prepare(
    "SELECT * FROM stock_fundamental WHERE symbol = ? LIMIT 1"
  ).get(symbol) as any;

  // 资金流向
  const fundFlow = db.prepare(
    "SELECT trade_date, net_inflow, main_force_inflow FROM stock_fund_flow WHERE symbol = ? ORDER BY trade_date DESC LIMIT 5"
  ).all(symbol) as any[];

  return NextResponse.json({
    symbol,
    daily: daily.reverse(),
    fundamental: fundamental || null,
    fundFlow,
  });
}

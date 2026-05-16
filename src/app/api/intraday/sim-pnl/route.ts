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

  // 模拟盈亏: 从 rec_performance 取最近的推荐盈亏数据
  const recHistory = db.prepare(
    "SELECT rec_date, rec_close, last_close, return_1d, return_5d, return_20d, last_return FROM rec_performance WHERE symbol = ? ORDER BY rec_date DESC LIMIT 10"
  ).all(symbol) as any[];

  // 日线数据用于模拟4时段盈亏
  const daily = db.prepare(
    "SELECT trade_date, open, high, low, close, volume FROM stock_daily_all WHERE symbol = ? ORDER BY trade_date DESC LIMIT 5"
  ).all(symbol) as any[];

  // 模拟4时段盈亏 (如果无法获取真实分时，根据日K估算)
  const periods = daily.slice(0, 3).map((d: any) => {
    const rangePct = d.high && d.low ? ((d.high - d.low) / d.low) * 100 : 0;
    const openPnl = d.open && d.close ? ((d.close - d.open) / d.open) * 100 : 0;
    return {
      date: d.trade_date,
      open: d.open,
      close: d.close,
      high: d.high,
      low: d.low,
      rangePct: +rangePct.toFixed(2),
      openPnl: +openPnl.toFixed(2),
      // 模拟4个时间段
      segments: [
        { label: "早盘(9:30-11:30)", pnl: +(openPnl * 0.4).toFixed(2) },
        { label: "午盘(13:00-14:00)", pnl: +(openPnl * 0.3).toFixed(2) },
        { label: "尾盘(14:00-14:30)", pnl: +(openPnl * 0.2).toFixed(2) },
        { label: "收盘(14:30-15:00)", pnl: +(openPnl * 0.1).toFixed(2) },
      ],
    };
  });

  return NextResponse.json({
    symbol,
    recHistory,
    dailyPnl: periods,
    simPnl: recHistory.length > 0 ? {
      latestReturn: recHistory[0].last_return,
      return1d: recHistory[0].return_1d,
      return5d: recHistory[0].return_5d,
      return20d: recHistory[0].return_20d,
    } : null,
  });
}

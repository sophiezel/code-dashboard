import { NextResponse } from "next/server";
import { getScreenerDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getScreenerDb();

  const indices = ["IDX_000001", "IDX_399001", "IDX_000688", "IDX_HSI"] as const;
  const labels: Record<string, string> = {
    IDX_000001: "上证指数",
    IDX_399001: "深证成指",
    IDX_000688: "科创50",
    IDX_HSI: "恒生指数",
  };

  const result: any[] = [];
  for (const code of indices) {
    const rows = db.prepare(
      "SELECT trade_date, open, high, low, close, volume FROM index_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT 30"
    ).all(code) as any[];
    if (rows.length > 0) {
      const latest = rows[0];
      const prev = rows[1] || latest;
      const changePct = prev.close ? ((latest.close - prev.close) / prev.close) * 100 : 0;
      result.push({
        symbol: code,
        label: labels[code] || code,
        ...latest,
        changePct,
        history: rows.slice(0, 20).reverse().map((r: any) => ({ date: r.trade_date, close: r.close })),
      });
    }
  }

  return NextResponse.json({ indices: result });
}

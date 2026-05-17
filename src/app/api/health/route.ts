import { NextResponse } from "next/server";
import { getScreenerDb } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // 1. DB连接
  try {
    const db = getScreenerDb();
    const row = db.prepare("SELECT 1 as ok").get() as any;
    checks.db = { status: row?.ok === 1 ? "ok" : "error" };
  } catch (e: any) {
    checks.db = { status: "error", detail: e.message };
  }

  // 2. DB文件大小
  try {
    const dbPath = process.env.SCREENER_DB_PATH || path.join(process.cwd(), "..", "stock-screener", "data", "screener.db");
    const stat = fs.statSync(dbPath);
    checks.db_size_mb = { status: stat.size / 1024 / 1024 < 2000 ? "ok" : "warn", detail: `${(stat.size / 1024 / 1024).toFixed(0)}MB` };
  } catch {
    checks.db_size_mb = { status: "error", detail: "file not found" };
  }

  // 3. 关键表行数
  try {
    const db = getScreenerDb();
    const tables = ["stock_daily", "stock_daily_v2", "data_provenance_log", "sync_outbox"];
    for (const t of tables) {
      try {
        const cnt = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any;
        checks[`table_${t}`] = { status: "ok", detail: `${cnt?.c ?? 0} rows` };
      } catch {
        checks[`table_${t}`] = { status: "missing" };
      }
    }
  } catch {}

  // 4. outbox backlog
  try {
    const db = getScreenerDb();
    const pending = (db.prepare("SELECT COUNT(*) as c FROM sync_outbox WHERE status='pending'").get() as any)?.c ?? 0;
    checks.outbox_pending = { status: pending > 100 ? "warn" : "ok", detail: `${pending}` };
  } catch {}

  // 汇总状态
  const hasError = Object.values(checks).some((c) => c.status === "error");
  const hasWarn = Object.values(checks).some((c) => c.status === "warn");

  return NextResponse.json({
    status: hasError ? "error" : hasWarn ? "warn" : "ok",
    timestamp: new Date().toISOString(),
    checks,
  }, {
    status: hasError ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCREENER_DB = process.env.DASHBOARD_SCREENER_DB || process.env.SCREENER_DB_PATH ||
  path.join(os.homedir(), "code/stock-screener/data/screener.db");
const REPORTS_DB = process.env.DASHBOARD_REPORTS_DB || process.env.REPORTS_DB_PATH ||
  path.join(os.homedir(), "code/dashboard/data/reports.db");

function checkDb(dbPath: string, label: string): { ok: boolean; error?: string; freshness?: string } {
  try {
    const db = new Database(dbPath, { readonly: true });
    db.pragma("busy_timeout = 3000");
    const integrity = db.prepare("PRAGMA integrity_check").get() as any;
    db.close();
    if (integrity?.integrity_check !== "ok") {
      return { ok: false, error: String(integrity?.integrity_check || "unknown") };
    }
    // Check data freshness for screener only
    if (label === "screener") {
      try {
        const db2 = new Database(dbPath, { readonly: true });
        db2.pragma("busy_timeout = 3000");
        const latest = db2.prepare(
          "SELECT MAX(date) as latest_date FROM stock_daily WHERE date IS NOT NULL"
        ).get() as any;
        db2.close();
        return { ok: true, freshness: latest?.latest_date || null };
      } catch {
        return { ok: true };
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function GET() {
  const screener = checkDb(SCREENER_DB, "screener");
  const reports = checkDb(REPORTS_DB, "reports");

  const result = {
    status: screener.ok && reports.ok ? "ok" : "degraded",
    db_ok: screener.ok,
    reports_ok: reports.ok,
    db_error: screener.error,
    reports_error: reports.error,
    data_freshness: screener.freshness || null,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  const statusCode = screener.ok && reports.ok ? 200 : 503;
  return NextResponse.json(result, { status: statusCode });
}

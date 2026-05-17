import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import { cacheInvalidate } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── DB path ──────────────────────────────────────────

function getScreenerDbPath(): string {
  if (process.env.SCREENER_DB_PATH) return process.env.SCREENER_DB_PATH;
  return path.join(os.homedir(), "code/stock-screener/data/screener.db");
}

// ─── Auth ─────────────────────────────────────────────

const SYNC_SECRET = process.env.DATA_SYNC_SECRET || "test";

function authorize(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, reason: "Missing or malformed Authorization header" };
  }
  const token = auth.slice(7).trim();
  if (token !== SYNC_SECRET) {
    return { ok: false, reason: "Invalid token" };
  }
  return { ok: true };
}

// ─── Write DB singleton (separate from the read-only one in db.ts) ──

let _writeDb: Database.Database | null = null;

function getWriteDb(): Database.Database {
  if (_writeDb) return _writeDb;
  const dbPath = getScreenerDbPath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  _writeDb = db;
  return db;
}

// ─── Dynamic INSERT ───────────────────────────────────

/**
 * Build and execute INSERT OR REPLACE for a batch of rows.
 * On conflict (row-level), skip that single row instead of failing the batch.
 */
function insertRows(
  db: Database.Database,
  table: string,
  rows: Record<string, unknown>[]
): { applied: number; errors: string[] } {
  if (rows.length === 0) return { applied: 0, errors: [] };

  // Collect all unique column keys across all rows
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  const colList = [...columns];

  if (colList.length === 0) return { applied: 0, errors: [] };

  // Build placeholders: (?,?,?) x N
  const placeholders = `(${colList.map(() => "?").join(",")})`;
  const insertSQL = `INSERT OR IGNORE INTO ${table} (${colList.map((c) => `"${c}"`).join(",")}) VALUES ${placeholders}`;

  // Also try UPDATE if row exists (upsert). Use INSERT OR REPLACE instead.
  // Actually, INSERT OR IGNORE is safer — skip rows that conflict.
  // If the caller wants upsert behavior we can switch to INSERT OR REPLACE.
  // Let's use INSERT OR REPLACE for now — it matches the task "upsert" semantics.
  const upsertSQL = `INSERT OR REPLACE INTO ${table} (${colList.map((c) => `"${c}"`).join(",")}) VALUES ${placeholders}`;

  let applied = 0;
  const errors: string[] = [];

  const stmt = db.prepare(upsertSQL);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = colList.map((c) => {
      const v = row[c];
      return v === undefined ? null : v;
    });

    try {
      stmt.run(...values);
      applied++;
    } catch (err: any) {
      errors.push(`row ${i}: ${err.message || String(err)}`);
    }
  }

  return { applied, errors };
}

// ─── Route ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth
  const authResult = authorize(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 401 });
  }

  // 2. Parse body
  let body: { table?: string; rows?: Record<string, unknown>[]; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { table, rows, source } = body;

  if (!table || typeof table !== "string") {
    return NextResponse.json({ error: "Missing or invalid 'table'" }, { status: 400 });
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Missing or invalid 'rows' (must be an array)" }, { status: 400 });
  }

  // 3. Write to DB
  const db = getWriteDb();
  const received = rows.length;

  // Wrap in a transaction for performance, but handle row failures gracefully
  const transaction = db.transaction(() => {
    const result = insertRows(db, table, rows);
    return result;
  });

  let result: { applied: number; errors: string[] };
  try {
    result = transaction();
  } catch (err: any) {
    return NextResponse.json(
      { error: `Transaction failed: ${err.message || String(err)}`, received, applied: 0 },
      { status: 500 }
    );
  }

  // 4. Invalidate cache for this table
  cacheInvalidate(table);

  // 5. Log
  if (result.errors.length > 0) {
    console.warn(`[sync] ${source || "unknown"} -> ${table}: ${result.applied}/${received} rows, ${result.errors.length} errors`, result.errors.slice(0, 5));
  } else {
    console.log(`[sync] ${source || "unknown"} -> ${table}: ${result.applied}/${received} rows OK`);
  }

  // 6. Respond
  return NextResponse.json({
    received,
    applied: result.applied,
    errors: result.errors.length > 0 ? result.errors.slice(0, 20) : undefined,
  });
}

/**
 * GET /api/data/sync — health check
 */
export async function GET() {
  return NextResponse.json({ status: "ok", message: "Data sync endpoint. Use POST to ingest data." });
}

import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import { type Report, type MacroScore, type SentimentData, type ThemePoolStock } from "./types";

const REPORTS_DB = path.join(os.homedir(), "code/dashboard/data/reports.db");
const SCREENER_DB = path.join(os.homedir(), "code/stock-screener/data/screener.db");

// ── WAL mode singletons ────────────────────────────

let _db: Database.Database | null = null;
let _screenerDb: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(REPORTS_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  _db = db;
  return db;
}

function getScreenerDb(): Database.Database {
  if (_screenerDb) return _screenerDb;
  const db = new Database(SCREENER_DB);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  _screenerDb = db;
  return db;
}

// Export for shared use by auth/quant modules
export { getScreenerDb };

// ─── Reports ─────────────────────────────────────────

export function getRecentReports(type?: string, limit = 20): Report[] {
  const db = getDb();
  if (type) {
    return db
      .prepare("SELECT * FROM reports WHERE type = ? ORDER BY created_at DESC LIMIT ?")
      .all(type, limit) as Report[];
  }
  return db
    .prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Report[];
}

export function getReportById(id: number): Report | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as Report) || null;
}

export function getLatestReportByType(type: string): Report | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM reports WHERE type = ? ORDER BY created_at DESC LIMIT 1")
      .get(type) as Report) || null
  );
}

export function getReportTypes(): string[] {
  const db = getDb();
  return db
    .prepare("SELECT DISTINCT type FROM reports ORDER BY type")
    .all()
    .map((r: any) => r.type);
}

export function getReportCount(): number {
  const db = getDb();
  return (db.prepare("SELECT COUNT(*) as c FROM reports").get() as any).c as number;
}

// ─── Macro Scores ────────────────────────────────────

export function getMacroScores(limit = 60): MacroScore[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM macro_scores ORDER BY date DESC LIMIT ?")
    .all(limit) as MacroScore[];
}

export function getLatestMacroScore(): MacroScore | null {
  const db = getDb();
  return (
    (db
      .prepare("SELECT * FROM macro_scores ORDER BY date DESC LIMIT 1")
      .get() as MacroScore) || null
  );
}

// ─── Sentiment (from screener.db, window-based cache) ──

/** Ensure sentiment_cache table exists in screener.db */
function ensureSentimentCache() {
  const db = getScreenerDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentiment_cache (
      date TEXT NOT NULL PRIMARY KEY,
      score INTEGER,
      limit_up_count INTEGER,
      limit_up_rate REAL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sc_date ON sentiment_cache(date);
  `);
}

/** Aggregate sentiment for one date from stock_daily */
function computeSentimentForDate(
  tradeDate: string
): SentimentData | null {
  const db = getScreenerDb();

  const prevDateRow = db.prepare(
    "SELECT MAX(trade_date) FROM stock_daily WHERE trade_date < ?"
  ).get(tradeDate) as { "MAX(trade_date)": string | null } | undefined;
  const prevDate = prevDateRow?.["MAX(trade_date)"];

  const todayRows = db.prepare(
    "SELECT symbol, open, high, close FROM stock_daily WHERE trade_date = ?"
  ).all(tradeDate) as { symbol: string; open: number | null; high: number | null; close: number | null }[];

  if (todayRows.length < 100) return null;

  const prevCloseMap = new Map<string, number>();
  if (prevDate) {
    const prevRows = db.prepare(
      "SELECT symbol, close FROM stock_daily WHERE trade_date = ?"
    ).all(prevDate) as { symbol: string; close: number | null }[];
    for (const r of prevRows) {
      if (r.close != null) prevCloseMap.set(r.symbol, r.close);
    }
  }

  let limitUp = 0, limitDown = 0, busted = 0, advancer = 0, decliner = 0;
  const total = todayRows.length;

  for (const row of todayRows) {
    if (row.close == null) continue;
    const closeVal = row.close;
    const prevClose = prevCloseMap.get(row.symbol);
    if (!prevClose || prevClose <= 0) continue;

    const pct = ((closeVal - prevClose) / prevClose) * 100;
    const limitPct = getLimitPct(row.symbol);

    if (pct > 0) advancer++;
    else if (pct < 0) decliner++;

    if (pct >= limitPct * 0.99) limitUp++;
    if (pct <= -limitPct * 0.99) limitDown++;

    if (row.high != null && row.open != null) {
      const highPct = ((row.high - prevClose) / prevClose) * 100;
      const closePct = ((closeVal - prevClose) / prevClose) * 100;
      if (highPct >= limitPct * 0.99 && closePct < limitPct * 0.99) busted++;
    }
  }

  const limitUpRate = +(limitUp / 5514).toFixed(4);
  const bustRatio = limitUp + busted > 0 ? +(busted / (limitUp + busted)).toFixed(4) : 0;
  const advDeclRatio = decliner > 0 ? +(advancer / decliner).toFixed(4) : 99;

  const limitScore = Math.min(100, (limitUp / 200) * 100) * 0.3;
  const ratioScore = Math.min(100, advDeclRatio * 50) * 0.25;
  const bustScore = (1 - bustRatio) * 100 * 0.2;
  const advScore = (advancer / total) * 100 * 0.25;
  const score = Math.max(0, Math.min(100, Math.round(limitScore + ratioScore + bustScore + advScore)));

  const details = JSON.stringify({
    涨停家数: limitUp,
    跌停家数: limitDown,
    炸板数: busted,
    炸板率: bustRatio,
    上涨家数: advancer,
    下跌家数: decliner,
    涨跌比: advDeclRatio,
  });

  return { date: tradeDate, score, limit_up_count: limitUp, limit_up_rate: limitUpRate, details, created_at: new Date().toISOString() };
}

function getLimitPct(code: string): number {
  if (code.startsWith("8") || code.startsWith("4") || code.startsWith("92")) return 30;
  if (code.startsWith("688")) return 20;
  if (code.startsWith("300") || code.startsWith("301")) return 20;
  return 10;
}

/** Fill cache for a window of dates. Today always recomputed. */
function fillCacheForWindow(startDate: string, endDate: string) {
  const db = getScreenerDb();
  ensureSentimentCache();

  const dates = db.prepare(
    `SELECT DISTINCT trade_date FROM stock_daily
     WHERE trade_date BETWEEN ? AND ?
     ORDER BY trade_date`
  ).all(startDate, endDate) as { trade_date: string }[];

  let inserted = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const { trade_date } of dates) {
    if (trade_date !== today) {
      const cached = db.prepare(
        "SELECT 1 FROM sentiment_cache WHERE date = ?"
      ).get(trade_date);
      if (cached) continue;
    }

    const result = computeSentimentForDate(trade_date);
    if (!result) continue;

    db.prepare(
      `INSERT OR REPLACE INTO sentiment_cache
       (date, score, limit_up_count, limit_up_rate, details, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(
      result.date, result.score, result.limit_up_count,
      result.limit_up_rate, result.details, new Date().toISOString()
    );
    inserted++;
  }
  return inserted;
}

// ── Public API ───────────────────────────────────────

/** Get sentiment history from cache. Today always recomputed from stock_daily. */
export function getSentimentHistory(limit = 60): SentimentData[] {
  ensureSentimentCache();
  const today = new Date().toISOString().slice(0, 10);
  fillCacheForWindow(today, today);

  const db = getScreenerDb();
  return db.prepare(
    "SELECT * FROM sentiment_cache ORDER BY date DESC LIMIT ?"
  ).all(limit) as SentimentData[];
}

export function getLatestSentiment(): SentimentData | null {
  ensureSentimentCache();
  const today = new Date().toISOString().slice(0, 10);
  fillCacheForWindow(today, today);

  const db = getScreenerDb();
  return (
    (db.prepare("SELECT * FROM sentiment_cache ORDER BY date DESC LIMIT 1").get() as SentimentData) || null
  );
}

// ─── Flow / Index / Futures (for mobile/flow, mobile/index) ──

export function getHsgtHistory(limit = 60): { trade_date: string; net_buy: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, net_buy FROM hsgt_daily ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

export function getMarginHistory(limit = 60): { trade_date: string; margin_balance: number; margin_buy: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, margin_balance, margin_buy FROM margin_daily ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

export function getIndexDailyHistory(code: string, limit = 30): { trade_date: string; close: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, close FROM index_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT ?"
  ).all(code, limit) as any[];
}

export function getGlobalIndexHistory(symbol: string, limit = 30): { trade_date: string; close: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, close FROM index_global_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT ?"
  ).all(symbol, limit) as any[];
}

/** Get single latest value for a global index (VIX, KWEB, etc.) */
export function getLatestGlobalIndex(symbol: string): { trade_date: string; close: number } | null {
  const row = getScreenerDb().prepare(
    "SELECT trade_date, close FROM index_global_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1"
  ).get(symbol) as any;
  return row || null;
}

// ─── Theme Pool ─────────────────────────────────────

/** Group theme_pool_stocks by theme from reports.db */
export function getThemePool(): { theme: string; stocks: ThemePoolStock[] }[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM theme_pool_stocks ORDER BY theme, segment, symbol"
  ).all() as ThemePoolStock[];
  const map = new Map<string, ThemePoolStock[]>();
  for (const r of rows) {
    const arr = map.get(r.theme) || [];
    arr.push(r);
    map.set(r.theme, arr);
  }
  return Array.from(map.entries()).map(([theme, stocks]) => ({ theme, stocks }));
}

// ─── Flow (extended for 9-module overview) ──────────

/** Get HSGT history filtered by direction */
export function getHsgtByDirection(direction: "north" | "south", limit = 60): { trade_date: string; net_buy: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, net_buy FROM hsgt_daily WHERE direction = ? ORDER BY trade_date DESC LIMIT ?"
  ).all(direction, limit) as any[];
}

/** Get margin short (做空) history */
export function getMarginShortHistory(limit = 60): { trade_date: string; short_balance: number; short_volume: number; margin_balance: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, short_balance, short_volume, margin_balance FROM margin_short_daily ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

/** Get LHB (龙虎榜) top N for a date or latest */
export function getLhbTop(date?: string, limit = 10): { trade_date: string; symbol: string; name: string; close: number; pct_change: number; net_amount: number; reason: string }[] {
  const db = getScreenerDb();
  if (date) {
    return db.prepare(
      "SELECT trade_date, symbol, name, close, pct_change, net_amount, reason FROM lhb_daily WHERE trade_date = ? ORDER BY ABS(net_amount) DESC LIMIT ?"
    ).all(date, limit) as any[];
  }
  // Latest date
  const latest = db.prepare("SELECT MAX(trade_date) as d FROM lhb_daily").get() as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT trade_date, symbol, name, close, pct_change, net_amount, reason FROM lhb_daily WHERE trade_date = ? ORDER BY ABS(net_amount) DESC LIMIT ?"
  ).all(latest.d, limit) as any[];
}

// ─── Futures ──────────────────────────────────────

/** Get latest two closes for futures symbols (for pct calculation) */
export function getLatestFutures(symbols: string[]): { symbol: string; trade_date: string; close: number; prev_close: number | null }[] {
  const db = getScreenerDb();
  const results: { symbol: string; trade_date: string; close: number; prev_close: number | null }[] = [];
  for (const sym of symbols) {
    const rows = db.prepare(
      "SELECT trade_date, close FROM futures_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT 2"
    ).all(sym) as { trade_date: string; close: number }[];
    if (rows.length > 0) {
      results.push({
        symbol: sym,
        trade_date: rows[0].trade_date,
        close: rows[0].close,
        prev_close: rows.length >= 2 ? rows[1].close : null,
      });
    }
  }
  return results;
}

// ─── HSGT Stock Top ────────────────────────────────

export function getHsgtStockTop(direction: "北向" | "南向", date?: string, limit = 10): {
  trade_date: string; symbol: string; rank: number; net_inflow: number; change_pct: number;
}[] {
  const db = getScreenerDb();
  if (date) {
    return db.prepare(
      "SELECT trade_date, symbol, rank, net_inflow, change_pct FROM hsgt_stock_daily WHERE direction = ? AND trade_date = ? ORDER BY rank LIMIT ?"
    ).all(direction, date, limit) as any[];
  }
  // Latest date
  const latest = db.prepare(
    "SELECT MAX(trade_date) as d FROM hsgt_stock_daily WHERE direction = ?"
  ).get(direction) as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT trade_date, symbol, rank, net_inflow, change_pct FROM hsgt_stock_daily WHERE direction = ? AND trade_date = ? ORDER BY rank LIMIT ?"
  ).all(direction, latest.d, limit) as any[];
}

// ─── HSGT Sector Aggregation ──────────────────────

export function getHsgtSectorTop(direction: "北向" | "南向", date?: string, limit = 5): {
  sector: string; total_net_buy: number; buy_count: number; sell_count: number;
  top_buy_name: string | null; top_buy_value: number | null;
}[] {
  const db = getScreenerDb();
  if (date) {
    return db.prepare(
      "SELECT sector, total_net_buy, buy_count, sell_count, top_buy_name, top_buy_value FROM hsgt_sector_daily WHERE direction = ? AND trade_date = ? ORDER BY ABS(total_net_buy) DESC LIMIT ?"
    ).all(direction, date, limit) as any[];
  }
  const latest = db.prepare(
    "SELECT MAX(trade_date) as d FROM hsgt_sector_daily WHERE direction = ?"
  ).get(direction) as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT sector, total_net_buy, buy_count, sell_count, top_buy_name, top_buy_value FROM hsgt_sector_daily WHERE direction = ? AND trade_date = ? ORDER BY ABS(total_net_buy) DESC LIMIT ?"
  ).all(direction, latest.d, limit) as any[];
}

// ─── ETF Flow ─────────────────────────────────────

export function getEtfFlowTop(limit = 6): {
  symbol: string; name: string; etf_type: string; pct_change: number; fund_size: number;
}[] {
  const db = getScreenerDb();
  const latest = db.prepare("SELECT MAX(trade_date) as d FROM etf_flow_daily").get() as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT symbol, name, etf_type, pct_change, fund_size FROM etf_flow_daily WHERE trade_date = ? ORDER BY ABS(pct_change) DESC LIMIT ?"
  ).all(latest.d, limit) as any[];
}

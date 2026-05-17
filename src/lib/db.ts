import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";
import {
  type Report, type MacroScore, type SentimentData, type ThemePoolStock,
  type SimPosition, type SimHkPosition, type SimNav, type SimTrade,
  type QuantPosition, type QuantNav, type QuantTrade, type FactorIC,
  type LivePosition, type LiveDiagnosis,
  type RiskOverview, type RiskEvent,
  type Message, type BenchmarkComparison,
} from "./types";

const REPORTS_DB = process.env.DASHBOARD_REPORTS_DB || path.join(os.homedir(), "code/dashboard/data/reports.db");
const SCREENER_DB = process.env.DASHBOARD_SCREENER_DB || path.join(os.homedir(), "code/stock-screener/data/screener.db");

// ── WAL mode singletons ────────────────────────────

let _db: Database.Database | null = null;
let _screenerDb: Database.Database | null = null;
let _screenerReadonlyDb: Database.Database | null = null;

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

// ─── Read-only connection ────────────────────────────

/** Path for SCREENER_DB, respecting env override */
function getScreenerPath(): string {
  if (process.env.SCREENER_DB_PATH) return process.env.SCREENER_DB_PATH;
  return SCREENER_DB;
}

/**
 * Open or return a cached read-only connection to screener.db.
 * Uses URI-mode `?mode=ro` to enforce read-only at the SQLite level.
 * This is safe to use concurrently with the writable connection.
 */
function connect_readonly(): Database.Database {
  if (_screenerReadonlyDb) return _screenerReadonlyDb;
  const dbPath = getScreenerPath();
  const db = new Database(`file:${dbPath}?mode=ro`, { readonly: true });
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  _screenerReadonlyDb = db;
  return db;
}

/**
 * Get the shared read-only DB connection.
 * Alias for connect_readonly() for consistency.
 */
function getReadonlyDB(): Database.Database {
  return connect_readonly();
}

export { connect_readonly, getReadonlyDB };

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
export function getLhbTop(date?: string, limit = 10): { trade_date: string; symbol: string; name: string; close: number; pct_change: number; net_amount: number; l_buy: number; l_sell: number; reason: string }[] {
  const db = getScreenerDb();
  if (date) {
    return db.prepare(
      "SELECT trade_date, symbol, name, close, pct_change, net_amount, l_buy, l_sell, reason FROM lhb_daily WHERE trade_date = ? ORDER BY ABS(net_amount) DESC LIMIT ?"
    ).all(date, limit) as any[];
  }
  const latest = db.prepare("SELECT MAX(trade_date) as d FROM lhb_daily").get() as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT trade_date, symbol, name, close, pct_change, net_amount, l_buy, l_sell, reason FROM lhb_daily WHERE trade_date = ? ORDER BY ABS(net_amount) DESC LIMIT ?"
  ).all(latest.d, limit) as any[];
}

/** Get daily margin buy amount history for trend chart */
export function getMarginBuyHistory(limit = 60): { trade_date: string; margin_buy: number; margin_balance: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, margin_buy, margin_balance FROM margin_daily ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

/** Get block trade (大宗交易) top N, with disc/prem vs daily close */
export function getBlockTradeTop(limit = 10): { trade_date: string; symbol: string; name: string; price: number; volume: number; amount: number; close: number | null }[] {
  const db = getScreenerDb();
  const latest = db.prepare("SELECT MAX(trade_date) as d FROM block_trades").get() as any;
  if (!latest?.d) return [];
  return db.prepare(
    `SELECT b.trade_date, b.symbol, b.name, b.price, b.volume, b.amount, sd.close
     FROM block_trades b
     LEFT JOIN stock_daily sd ON b.symbol = sd.symbol AND b.trade_date = sd.trade_date
     WHERE b.trade_date = ?
     ORDER BY b.amount DESC LIMIT ?`
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
  trade_date: string; symbol: string; name: string | null; rank: number; net_inflow: number; change_pct: number;
}[] {
  const db = getScreenerDb();
  if (date) {
    return db.prepare(
      "SELECT trade_date, symbol, name, rank, net_inflow, change_pct FROM hsgt_stock_daily WHERE direction = ? AND trade_date = ? ORDER BY rank LIMIT ?"
    ).all(direction, date, limit) as any[];
  }
  const latest = db.prepare(
    "SELECT MAX(trade_date) as d FROM hsgt_stock_daily WHERE direction = ?"
  ).get(direction) as any;
  if (!latest?.d) return [];
  return db.prepare(
    "SELECT trade_date, symbol, name, rank, net_inflow, change_pct FROM hsgt_stock_daily WHERE direction = ? AND trade_date = ? ORDER BY rank LIMIT ?"
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

// ─── HSGT Total Trend ───────────────────────────

export function getHsgtTotalTrend(direction: "北向" | "南向", limit = 120): { trade_date: string; total: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, SUM(net_inflow) as total FROM hsgt_stock_daily WHERE direction = ? AND net_inflow IS NOT NULL GROUP BY trade_date ORDER BY trade_date DESC LIMIT ?"
  ).all(direction, limit) as any[];
}

/** Get individual stock net_inflow history for trend sparklines */
export function getHsgtStockTrends(direction: "北向" | "南向", symbols: string[], limit = 30): Record<string, number[]> {
  const db = getScreenerDb();
  const result: Record<string, number[]> = {};
  for (const sym of symbols) {
    const rows = db.prepare(
      "SELECT net_inflow FROM hsgt_stock_daily WHERE direction = ? AND symbol = ? ORDER BY trade_date DESC LIMIT ?"
    ).all(direction, sym, limit) as { net_inflow: number }[];
    result[sym] = rows.map(r => r.net_inflow / 1e8).reverse();
  }
  return result;
}

// ─── Macro Indicator History ──────────────────────

export function getCpiHistory(limit = 60): { trade_date: string; value: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, cpi_yoy as value FROM macro_cpi ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

export function getPpiHistory(limit = 60): { trade_date: string; value: number }[] {
  return getScreenerDb().prepare(
    "SELECT trade_date, ppi_yoy as value FROM macro_ppi ORDER BY trade_date DESC LIMIT ?"
  ).all(limit) as any[];
}

export function getPmiHistory(limit = 60): { trade_date: string; value: number }[] {
  return getScreenerDb().prepare(
    'SELECT "月份" as trade_date, "制造业-指数" as value FROM macro_pmi ORDER BY "月份" DESC LIMIT ?'
  ).all(limit) as any[];
}

// ─── Theme / Sector Analytics ────────────────────

/** Get theme fund flow (SUM main_net for theme stocks) */
export function getThemeFundFlow(symbols: string[]): number | null {
  const db = getScreenerDb();
  if (symbols.length === 0) return null;
  const ph = symbols.map(() => "?").join(",");
  const row = db.prepare(
    `SELECT SUM(main_net) as total FROM fund_flow_stock WHERE symbol IN (${ph}) AND trade_date = (SELECT MAX(trade_date) FROM fund_flow_stock)`
  ).get(...symbols) as any;
  return row?.total ?? null;
}

/** Get theme daily avg change_pct trend */
export function getThemeTrend(symbols: string[], limit = 61): { trade_date: string; avg_pct: number }[] {
  const db = getScreenerDb();
  if (symbols.length === 0) return [];
  const ph = symbols.map(() => "?").join(",");
  return db.prepare(
    `SELECT trade_date, AVG(chg) as avg_pct FROM (
      SELECT trade_date, (close - prev_close) / prev_close * 100 as chg FROM (
        SELECT trade_date, close, LAG(close) OVER (ORDER BY trade_date ASC) as prev_close
        FROM stock_daily WHERE symbol IN (${ph}) ORDER BY trade_date DESC LIMIT ${limit}
      ) WHERE prev_close IS NOT NULL AND prev_close > 0 ORDER BY trade_date ASC
    ) GROUP BY trade_date ORDER BY trade_date ASC`
  ).all(...symbols) as any[];
}

/** Get individual stock daily change_pct trend */
export function getStockTrend(symbol: string, limit = 31): number[] {
  const db = getScreenerDb();
  const rows = db.prepare(
    `SELECT chg FROM (
      SELECT (close - prev_close) / prev_close * 100 as chg FROM (
        SELECT close, LAG(close) OVER (ORDER BY trade_date ASC) as prev_close
        FROM stock_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT ${limit}
      ) WHERE prev_close IS NOT NULL AND prev_close > 0 ORDER BY trade_date ASC
    )`
  ).all(symbol) as { chg: number }[];
  return rows.map(r => r.chg);
}

export function getM2History(limit = 60): { trade_date: string; value: number }[] {
  return getScreenerDb().prepare(
    'SELECT "月份" as trade_date, "货币和准货币(M2)-同比增长" as value FROM macro_m2 ORDER BY "月份" DESC LIMIT ?'
  ).all(limit) as any[];
}

export function getShiborHistory(limit = 60): { trade_date: string; value: number }[] {
  return getScreenerDb().prepare(
    'SELECT "日期" as trade_date, "O/N-定价" as value FROM macro_shibor ORDER BY "日期" DESC LIMIT ?'
  ).all(limit) as any[];
}

// ─── Market Turnover ────────────────────────────

export function getLatestTotalTurnover(): number | null {
  const db = getScreenerDb();
  const row = db.prepare(
    "SELECT SUM(volume * close) as total FROM stock_daily WHERE trade_date = (SELECT MAX(trade_date) FROM stock_daily) AND volume > 0 AND close > 0"
  ).get() as any;
  return row?.total ?? null;
}

/** Get latest daily close from versioned table (fallback to old table) */
export function getLatestDailyClose(symbol: string): { close: number; trade_date: string; confidence: number } | null {
  const db = getScreenerDb();
  // Try stock_daily_latest first
  let row = db.prepare(
    "SELECT close, trade_date, confidence FROM stock_daily_latest WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1"
  ).get(symbol) as any;
  if (row) return row;
  // Fallback to old stock_daily
  row = db.prepare(
    "SELECT close, trade_date, NULL as confidence FROM stock_daily WHERE symbol = ? ORDER BY trade_date DESC LIMIT 1"
  ).get(symbol) as any;
  return row ?? null;
}

/** Get version statistics for latest trade date */
export function getDailyV2Stats(): { trade_date: string; total: number; dual_source: number; avg_confidence: number } | null {
  const db = getScreenerDb();
  return db.prepare(
    `SELECT trade_date, COUNT(*) as total,
            SUM(CASE WHEN source_count >= 2 THEN 1 ELSE 0 END) as dual_source,
            AVG(confidence) as avg_confidence
     FROM stock_daily_v2
     GROUP BY trade_date ORDER BY trade_date DESC LIMIT 1`
  ).get() as any;
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Paper (模拟盘)
// ═══════════════════════════════════════════════════════════════

/** Get sim positions for a given market+slot */
export function getPaperPortfolio(market: "a" | "hk", slot?: string): SimPosition[] | SimHkPosition[] {
  const db = getScreenerDb();
  if (market === "hk") {
    // sim_hk_position: strategy (not slot), weight_pct 为0时用 entry_price*shares 估算
    if (slot) {
      return db.prepare(
        "SELECT *, COALESCE(weight_pct,0) as weight_pct FROM sim_hk_position WHERE strategy = ?"
      ).all(slot) as SimHkPosition[];
    }
    return db.prepare(
      "SELECT *, COALESCE(weight_pct,0) as weight_pct FROM sim_hk_position"
    ).all() as SimHkPosition[];
  }
  // sim_position: slot, weight_pct 可能不存在
  if (slot) {
    return db.prepare(
      "SELECT *, COALESCE(weight_pct,0) as weight_pct FROM sim_position WHERE slot = ?"
    ).all(slot) as SimPosition[];
  }
  return db.prepare(
    "SELECT *, COALESCE(weight_pct,0) as weight_pct FROM sim_position"
  ).all() as SimPosition[];
}

/** Get sim NAV history */
export function getPaperNav(market: "a" | "hk", limit = 60): SimNav[] {
  const db = getScreenerDb();
  if (market === "hk") {
    return db.prepare(
      "SELECT trade_date, nav, daily_return FROM sim_hk_nav ORDER BY trade_date DESC LIMIT ?"
    ).all(limit) as SimNav[];
  }
  return db.prepare(
    "SELECT datetime as trade_date, COALESCE(nav, market_value) as nav, COALESCE(daily_return,0) as daily_return FROM sim_portfolio_snapshot ORDER BY datetime DESC LIMIT ?"
  ).all(limit) as SimNav[];
}

/** Get sim trades */
export function getPaperTrades(market: "a" | "hk", limit = 50): SimTrade[] {
  const db = getScreenerDb();
  const table = market === "hk" ? "sim_hk_trades" : "sim_trades";
  return db.prepare(
    `SELECT * FROM ${table} ORDER BY trade_time DESC LIMIT ?`
  ).all(limit) as SimTrade[];
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Quant (量化盘)
// ═══════════════════════════════════════════════════════════════

/** Get quant positions */
export function getQuantPortfolio(market: "a" | "hk", limit = 20): QuantPosition[] {
  const db = getScreenerDb();
  const table = market === "hk" ? "quant_hk_position" : "quant_position";
  return db.prepare(
    `SELECT *, COALESCE(weight,0) as weight_pct FROM ${table} ORDER BY weight DESC LIMIT ?`
  ).all(limit) as QuantPosition[];
}

/** Get quant NAV history */
export function getQuantNav(market: "a" | "hk", limit = 60): QuantNav[] {
  const db = getScreenerDb();
  const table = market === "hk" ? "quant_hk_nav" : "quant_nav";
  return db.prepare(
    `SELECT trade_date, nav, daily_return FROM ${table} ORDER BY trade_date DESC LIMIT ?`
  ).all(limit) as QuantNav[];
}

/** Get quant trades */
export function getQuantTrades(market: "a" | "hk", limit = 50): QuantTrade[] {
  const db = getScreenerDb();
  const table = market === "hk" ? "quant_hk_trades" : "quant_trades";
  return db.prepare(
    `SELECT * FROM ${table} ORDER BY trade_date DESC LIMIT ?`
  ).all(limit) as QuantTrade[];
}

/** Get factor IC history (placeholder — table may not exist yet) */
export function getFactorIC(limit = 30): FactorIC[] {
  try {
    return getScreenerDb().prepare(
      "SELECT * FROM quant_factor_ic ORDER BY date DESC LIMIT ?"
    ).all(limit) as FactorIC[];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Live Portfolio (实盘)
// ═══════════════════════════════════════════════════════════════

/** Get live portfolio positions (desensitized: only weight_pct + pnl_pct) */
export function getLivePortfolio(): LivePosition[] {
  return getDb().prepare(
    "SELECT symbol, name, weight_pct, pnl_pct, sector FROM live_portfolio ORDER BY weight_pct DESC"
  ).all() as LivePosition[];
}

/** Get live portfolio diagnosis — reads from reports */
export function getLiveDiagnosis(): LiveDiagnosis[] {
  try {
    return getScreenerDb().prepare(
      "SELECT metric, value, status FROM portfolio_diagnosis ORDER BY metric"
    ).all() as LiveDiagnosis[];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Risk (风控)
// ═══════════════════════════════════════════════════════════════

/** Get unified risk overview */
export function getRiskOverview(): RiskOverview | null {
  const row = getScreenerDb().prepare(
    "SELECT * FROM risk_metrics ORDER BY trade_date DESC LIMIT 1"
  ).get() as any;
  if (!row) return null;
  return {
    var_95: row.var_95 ?? 0,
    var_99: row.var_99 ?? 0,
    cvar_95: row.cvar_95 ?? 0,
    max_drawdown: row.max_drawdown ?? 0,
    sector_concentration: row.sector_concentration ?? 0,
    current_drawdown_pct: row.max_drawdown ?? 0,
    total_drawdown_pct: row.max_drawdown ?? 0,
    volatility: 0,       // risk_metrics 无此列
    sharpe: 0,           // risk_metrics 无此列
    max_consecutive_losses: 0,
    update_time: row.trade_date ?? "",  // alias
  } as RiskOverview;
}

/** Get recent risk events / drawdown alerts */
export function getRiskEvents(limit = 20): RiskEvent[] {
  return getScreenerDb().prepare(
    "SELECT id, alert_time as date, drawdown_pct as metric_value, 0.15 as threshold, " +
    "current_pnl_pct, peak_pnl_pct, 'drawdown' as event_type, 'warning' as severity, " +
    "'' as symbol, '回撤告警' as type, '账户回撤超限' as message, 1 as acknowledged " +
    "FROM sim_drawdown_alerts ORDER BY alert_time DESC LIMIT ?"
  ).all(limit) as RiskEvent[];
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Messages (消息)
// ═══════════════════════════════════════════════════════════════

/** Get messages, optionally filtered by type */
export function getMessages(type?: string, limit = 50): Message[] {
  const db = getScreenerDb();
  if (type) {
    return db.prepare(
      "SELECT *, read as is_read FROM messages WHERE type = ? ORDER BY created_at DESC LIMIT ?"
    ).all(type, limit) as Message[];
  }
  return db.prepare(
    "SELECT *, read as is_read FROM messages ORDER BY created_at DESC LIMIT ?"
  ).all(limit) as Message[];
}

/** Get single message by id */
export function getMessageById(id: number): Message | null {
  const row = getScreenerDb().prepare(
    "SELECT *, read as is_read FROM messages WHERE id = ?"
  ).get(id) as any;
  return (row as Message) || null;
}

/** Mark a message as read */
export function markMessageRead(id: number): void {
  getScreenerDb().prepare(
    "UPDATE messages SET read = 1 WHERE id = ?"
  ).run(id);
}

// ═══════════════════════════════════════════════════════════════
// Trading Module — Benchmark Comparison (基准)
// ═══════════════════════════════════════════════════════════════

/** Get benchmark comparison data */
export function getBenchmarkComparison(): BenchmarkComparison[] {
  return getScreenerDb().prepare(
    "SELECT * FROM benchmark_comparison ORDER BY CASE period WHEN '1周' THEN 1 WHEN '1月' THEN 2 WHEN '3月' THEN 3 WHEN '6月' THEN 4 WHEN '1年' THEN 5 ELSE 6 END"
  ).all() as BenchmarkComparison[];
}

// ═══════════════════════════════════════════════════════════════
// Stub exports for pre-existing pages (avoid import errors)
// ═══════════════════════════════════════════════════════════════

export function getRecPerformance(limit = 20) {
  try { return getScreenerDb().prepare("SELECT * FROM rec_performance ORDER BY rec_date DESC LIMIT ?").all(limit); }
  catch { return []; }
}
export function getRecPerformanceSummary() { return { total: 0, win_rate: 0, avg_return_5d: 0 }; }
export function getPortfolioNavHistory(limit = 60) {
  try { return getScreenerDb().prepare("SELECT trade_date, nav, daily_return FROM portfolio_nav ORDER BY trade_date DESC LIMIT ?").all(limit); }
  catch { return []; }
}
export function getRiskMetrics(limit = 60) {
  try { return getScreenerDb().prepare("SELECT * FROM risk_metrics ORDER BY trade_date DESC LIMIT ?").all(limit); }
  catch { return []; }
}
export function getLatestHsgt() {
  try { return getScreenerDb().prepare("SELECT * FROM hsgt_daily ORDER BY trade_date DESC LIMIT 1").get(); }
  catch { return null; }
}
export function getLatestMargin() {
  try { return getScreenerDb().prepare("SELECT * FROM margin_daily ORDER BY trade_date DESC LIMIT 1").get(); }
  catch { return null; }
}
export function getFuturesLatest(symbols: string[] = []) {
  try {
    if (!symbols.length) return [];
    const placeholders = symbols.map(() => '?').join(',');
    return getScreenerDb().prepare(
      `SELECT symbol, trade_date, close, prev_close FROM futures_daily WHERE symbol IN (${placeholders}) AND trade_date = (SELECT MAX(trade_date) FROM futures_daily WHERE symbol IN (${placeholders}))`
    ).all(...symbols);
  } catch { return []; }
}

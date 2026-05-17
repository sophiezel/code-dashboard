import {
  getLatestMacroScore,
  getLatestSentiment,
  getLatestReportByType,
  getMacroScores,
  getSentimentHistory,
  getIndexDailyHistory,
  getGlobalIndexHistory,
  getLatestGlobalIndex,
  getThemePool,
  getMarginHistory,
  getMarginShortHistory,
  getLhbTop,
  getLatestFutures,
  getHsgtByDirection,
  getHsgtStockTop,
} from "@/lib/db";
import { MobileDashboardClient } from "./MobileDashboardClient";
import { safeJsonParse } from "@/lib/utils";
import type { ThemePool } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function jp<T = any>(raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  return safeJsonParse(raw) as T | null;
}

function indexPct(code: string, isGlobal: boolean): { pct: number | null } {
  const hist = isGlobal
    ? getGlobalIndexHistory(code, 2)
    : getIndexDailyHistory(code, 2);
  const latest = hist[0];
  const prev = hist[1];
  const pct = prev?.close && latest?.close
    ? ((latest.close - prev.close) / prev.close * 100)
    : null;
  return { pct };
}

// ── Decision engine ──────────────────────────────

interface Decision {
  regime: "进攻" | "防御" | "观望";
  regimeEmoji: string;
  positionPct: number;
  reason: string;
  focusThemes: string[];
}

function computeDecision(
  macroScore: number | null,
  macroPosition: number | null,
  sentimentScore: number | null,
  vix: number | null,
  marginTrend: number | null, // weekly % change
  themePool: ThemePool[]
): Decision {
  // Default fallback
  const fallback: Decision = {
    regime: "观望", regimeEmoji: "⚪",
    positionPct: 30, reason: "数据不足，保持观望",
    focusThemes: [],
  };

  if (macroScore == null && sentimentScore == null) return fallback;

  // Macro score (0-100) → factor 0-1
  const macroFactor = macroScore != null ? Math.min(1, macroScore / 100) : 0.5;
  // Sentiment → factor 0-1
  const sentFactor = sentimentScore != null ? Math.min(1, sentimentScore / 100) : 0.5;
  // VIX → inverse factor (high VIX = low factor)
  const vixFactor = vix != null
    ? vix > 30 ? 0.1 : vix > 25 ? 0.4 : vix > 20 ? 0.7 : 1.0
    : 0.5;
  // Margin trend → factor (accelerating = bullish)
  const marginFactor = marginTrend != null
    ? marginTrend > 3 ? 1.2 : marginTrend > 0 ? 1.0 : marginTrend > -3 ? 0.7 : 0.4
    : 0.8;

  // Weighted composite
  const composite = macroFactor * 0.3 + sentFactor * 0.3 + vixFactor * 0.2 + marginFactor * 0.2;

  // Position recommendation
  let positionPct: number;
  let regime: "进攻" | "防御" | "观望";
  let regimeEmoji: string;

  if (composite >= 0.7) {
    regime = "进攻";
    regimeEmoji = "🟢";
    positionPct = Math.round(60 + (composite - 0.7) / 0.3 * 30); // 60-90%
  } else if (composite >= 0.45) {
    regime = "防御";
    regimeEmoji = "🟡";
    positionPct = Math.round(30 + (composite - 0.45) / 0.25 * 30); // 30-60%
  } else {
    regime = "观望";
    regimeEmoji = "🔴";
    positionPct = Math.max(0, Math.round(composite * 50)); // 0-25%
  }

  // Cap at macro position if available
  if (macroPosition != null) {
    positionPct = Math.min(positionPct, Math.round(macroPosition * 100));
  }

  // Reason string
  const parts: string[] = [];
  if (macroScore != null) {
    parts.push(macroScore >= 70 ? "宏观扩张" : macroScore >= 50 ? "宏观中性" : "宏观收缩");
  }
  if (sentimentScore != null) {
    parts.push(sentimentScore >= 60 ? "情绪乐观" : sentimentScore >= 40 ? "情绪中性" : "情绪悲观");
  }
  if (vix != null) {
    parts.push(vix > 25 ? `VIX高(${vix.toFixed(0)})` : vix > 20 ? `VIX偏高(${vix.toFixed(0)})` : `VIX正常(${vix.toFixed(0)})`);
  }
  if (marginTrend != null && marginTrend > 3) parts.push("杠杆加速");
  if (marginTrend != null && marginTrend < -2) parts.push("杠杆收缩");

  // Focus themes: top 2 by stock count
  const focusThemes = themePool.length > 0
    ? themePool.slice(0, 2).map(t => t.theme.length > 6 ? t.theme.slice(0, 6) : t.theme)
    : [];

  return {
    regime, regimeEmoji, positionPct,
    reason: parts.join(" · ") || "数据收集中",
    focusThemes,
  };
}

// ── Main page ────────────────────────────────────

export default function MobileDashboardPage() {
  // M1
  const macro = getLatestMacroScore();
  const macroScores = getMacroScores(60);

  // M2
  const sentiment = getLatestSentiment();
  const sentimentHistory = getSentimentHistory(60);
  const vix = getLatestGlobalIndex("VIX");

  // M2 details: 涨跌比 + 炸板率
  const sentDetails = sentiment?.details ? jp<Record<string, number>>(sentiment.details) : null;
  const advDeclRatio = sentDetails?.["涨跌比"] ?? null;
  const bustRate = sentDetails?.["炸板率"] ?? null;
  const limitUpRate = sentiment?.limit_up_rate ?? 0;
  // Extreme sentiment: >5% or <0.2%
  const sentimentAlert = limitUpRate > 0.05 ? "过热反转预警"
    : limitUpRate < 0.002 && limitUpRate > 0 ? "冰点反转信号"
    : null;

  // M3
  const domesticIndices = [
    { label: "上证指数", ...indexPct("IDX_000001", false) },
    { label: "创业板", ...indexPct("IDX_399006", false) },
    { label: "恒生科技", ...indexPct("KWEB", true) },
    { label: "沪深300", ...indexPct("IDX_000300", false) },
    { label: "中证500", ...indexPct("IDX_000905", false) },
  ];
  const globalIndices = [
    { label: "中概互联", ...indexPct("KWEB", true) },
  ];

  // M4 (now merged: margin + south + LHB)
  const margin = getMarginHistory(30);
  const marginShort = getMarginShortHistory(30);
  const lhb = getLhbTop(undefined, 10);
  const southFlow = getHsgtByDirection("south", 30);

  // Margin 7-day trend
  const marginTrend: number | null = (() => {
    if (margin.length < 7) return null;
    const recent = [...margin].reverse().slice(-7);
    const first = recent[0]?.margin_balance;
    const last = recent[recent.length - 1]?.margin_balance;
    return first && last ? ((last - first) / first * 100) : null;
  })();

  // North-bound stock TOP10 (from hsgt_stock_daily)
  const northStocks = getHsgtStockTop("北向", undefined, 10);
  const northTotalInflow = northStocks.reduce((sum, s) => sum + (s.net_inflow || 0), 0);
  // South-bound stock TOP10
  const southStocks = getHsgtStockTop("南向", undefined, 10);
  const southTotalInflow = southStocks.reduce((sum, s) => sum + (s.net_inflow || 0), 0);

  // M7: KWEB + futures
  const kwebPct = indexPct("KWEB", true).pct;
  const futuresData = getLatestFutures(["CU0", "AU0", "SC0"]);
  const fpct = (sym: string) => {
    const f = futuresData.find(x => x.symbol === sym);
    return f?.prev_close ? ((f.close - f.prev_close) / f.prev_close * 100) : null;
  };
  const futures = [
    { label: "铜", pct: fpct("CU0"), close: null },
    { label: "金", pct: fpct("AU0"), close: null },
    { label: "原油", pct: fpct("SC0"), close: null },
  ];

  // M8/M9: theme pool (M8 main, M9 potential)
  let themePool: ThemePool[] = [];
  try { themePool = getThemePool(); } catch { /* empty */ }

  // ── Decision ──
  const decision = computeDecision(
    macro?.score ?? null,
    macro?.position ?? null,
    sentiment?.score ?? null,
    vix?.close ?? null,
    marginTrend,
    themePool
  );

  // Reports
  const latestPicks = getLatestReportByType("daily_picks");
  const latestBuy = getLatestReportByType("buy_signals");
  const latestReview = getLatestReportByType("portfolio_review");

  // Serialize
  const macroParsed = macro ? jp<Record<string, number>>(macro.indicators) : null;
  const sentParsed = sentiment ? jp<Record<string, any>>(sentiment.details) : null;

  return (
    <MobileDashboardClient
      // Decision
      decision={decision}
      // M1
      macroScore={macro?.score ?? null}
      macroPosition={macro?.position ?? null}
      macroDate={macro?.date ?? null}
      macroIndicatorKeys={macroParsed ? Object.keys(macroParsed) : []}
      macroIndicatorValues={macroParsed ? Object.values(macroParsed).map(v => typeof v === "number" ? v : 0) : []}
      macroChartData={[...macroScores].reverse().map(s => s.score)}
      // M2
      sentimentScore={sentiment?.score ?? null}
      sentimentLimitUp={sentiment?.limit_up_count ?? 0}
      sentimentLimitUpRate={limitUpRate}
      sentimentAlert={sentimentAlert}
      advDeclRatio={advDeclRatio}
      bustRate={bustRate}
      sentimentChartData={[...sentimentHistory].reverse().map(s => s.score)}
      vixClose={vix?.close ?? null}
      // M3
      domesticIndices={domesticIndices}
      globalIndices={globalIndices}
      // M4 (merged: margin + south + LHB)
      marginBalance={margin.length > 0 ? margin[0].margin_balance : null}
      marginChartData={[...margin].reverse().map(r => r.margin_balance / 1e8)}
      shortBalance={marginShort.length > 0 ? marginShort[0].short_balance : null}
      marginTrend={marginTrend}
      southNetBuy={southFlow.length > 0 ? southFlow[0].net_buy : null}
      southChartData={[...southFlow].reverse().map(r => r.net_buy ?? 0)}
      lhbTop5={lhb.slice(0, 5).map(r => ({
        symbol: r.symbol, name: r.name,
        pct_change: r.pct_change, net_amount: r.net_amount,
      }))}
      // M5: 北向
      northStocks={northStocks.map(s => ({
        symbol: s.symbol, rank: s.rank,
        net_inflow: s.net_inflow, change_pct: s.change_pct,
      }))}
      northTotalInflow={northTotalInflow}
      southStocks={southStocks.map(s => ({
        symbol: s.symbol, rank: s.rank,
        net_inflow: s.net_inflow, change_pct: s.change_pct,
      }))}
      southTotalInflow={southTotalInflow}
      // M6
      kwebPct={kwebPct}
      futures={futures}
      // M8/M9
      themePool={themePool}
      // Reports
      latestPicks={latestPicks ? {
        id: latestPicks.id, type: latestPicks.type,
        title: latestPicks.title || latestPicks.type,
        preview: latestPicks.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestPicks.created_at,
      } : null}
      latestBuy={latestBuy ? {
        id: latestBuy.id, type: latestBuy.type,
        title: latestBuy.title || latestBuy.type,
        preview: latestBuy.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestBuy.created_at,
      } : null}
      latestReview={latestReview ? {
        id: latestReview.id, type: latestReview.type,
        title: latestReview.title || latestReview.type,
        preview: latestReview.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestReview.created_at,
      } : null}
    />
  );
}

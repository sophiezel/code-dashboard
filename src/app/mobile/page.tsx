import {
  getLatestMacroScore,
  getLatestSentiment,
  getRecentReports,
  getLatestReportByType,
  getMacroScores,
  getSentimentHistory,
} from "@/lib/db";
import { MobileDashboardClient } from "./MobileDashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 60;

function safeParse(json: string | Record<string,unknown> | null): Record<string, unknown> | null {
  if (!json) return null;
  // Neon JSONB returns already-parsed objects, SQLite returns strings
  if (typeof json === "object") return json as Record<string, unknown>;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export default async function MobileDashboardPage() {
  const macro = await getLatestMacroScore();
  const sentiment = await getLatestSentiment();
  const recent = await getRecentReports(undefined, 8);
  const latestPicks = await getLatestReportByType("daily_picks");
  const latestBuy = await getLatestReportByType("buy_signals");
  const latestReview = await getLatestReportByType("portfolio_review");
  const macroScores = await getMacroScores(60);
  const sentimentHistory = await getSentimentHistory(60);

  const macroParsed = macro ? safeParse(macro.indicators as unknown as string) : null;
  const sentParsed = sentiment ? safeParse(sentiment.details as unknown as string) : null;

  return (
    <MobileDashboardClient
      macroScore={macro?.score ?? null}
      macroPosition={macro?.position ?? null}
      macroDate={macro?.date ?? null}
      indicatorKeys={macroParsed ? Object.keys(macroParsed) : []}
      indicatorValues={macroParsed ? Object.values(macroParsed).map(v => typeof v === "number" ? v : 0) : []}
      sentimentScore={sentiment?.score ?? null}
      sentimentLimitUp={sentiment?.limit_up_count ?? 0}
      sentimentLimitUpRate={sentiment?.limit_up_rate ?? 0}
      detailKeys={sentParsed ? Object.keys(sentParsed) : []}
      detailValues={sentParsed ? Object.values(sentParsed).map(v => String(v)) : []}
      recentReports={recent.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title || r.type,
        preview: r.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: r.created_at,
      }))}
      latestPicks={latestPicks ? {
        id: latestPicks.id,
        type: latestPicks.type,
        title: latestPicks.title || latestPicks.type,
        preview: latestPicks.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestPicks.created_at,
      } : null}
      latestBuy={latestBuy ? {
        id: latestBuy.id,
        type: latestBuy.type,
        title: latestBuy.title || latestBuy.type,
        preview: latestBuy.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestBuy.created_at,
      } : null}
      latestReview={latestReview ? {
        id: latestReview.id,
        type: latestReview.type,
        title: latestReview.title || latestReview.type,
        preview: latestReview.content.substring(0, 80).replace(/[#*`\n]/g, " "),
        created_at: latestReview.created_at,
      } : null}
      macroChartData={[...macroScores].reverse().map(s => s.score)}
      sentimentChartData={[...sentimentHistory].reverse().map(s => s.score)}
    />
  );
}

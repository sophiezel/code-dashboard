import { Pool } from "pg";
import { type Report, type MacroScore, type SentimentData } from "./types";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 30000,
});

// ─── Reports ─────────────────────────────────────────

export async function getRecentReports(type?: string, limit = 20): Promise<Report[]> {
  const client = await pool.connect();
  try {
    const cols = "id, type, title, content, metadata, created_at::text as created_at";
    if (type) {
      const res = await client.query(
        `SELECT ${cols} FROM reports WHERE type = $1 ORDER BY created_at DESC LIMIT $2`,
        [type, limit]
      );
      return res.rows as Report[];
    }
    const res = await client.query(
      `SELECT ${cols} FROM reports ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return res.rows as Report[];
  } finally {
    client.release();
  }
}

export async function getReportById(id: number): Promise<Report | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT id, type, title, content, metadata, created_at::text as created_at FROM reports WHERE id = $1",
      [id]
    );
    return (res.rows[0] as Report) || null;
  } finally {
    client.release();
  }
}

export async function getLatestReportByType(type: string): Promise<Report | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT id, type, title, content, metadata, created_at::text as created_at FROM reports WHERE type = $1 ORDER BY created_at DESC LIMIT 1",
      [type]
    );
    return (res.rows[0] as Report) || null;
  } finally {
    client.release();
  }
}

export async function getReportTypes(): Promise<string[]> {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT DISTINCT type FROM reports ORDER BY type");
    return res.rows.map((r: { type: string }) => r.type);
  } finally {
    client.release();
  }
}

export async function getReportCount(): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT COUNT(*) as c FROM reports");
    return Number(res.rows[0].c);
  } finally {
    client.release();
  }
}

// ─── Macro Scores ────────────────────────────────────

export async function getMacroScores(limit = 60): Promise<MacroScore[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT date::text as date, score, position, indicators, created_at::text as created_at FROM macro_scores ORDER BY date DESC LIMIT $1",
      [limit]
    );
    return res.rows as MacroScore[];
  } finally {
    client.release();
  }
}

export async function getLatestMacroScore(): Promise<MacroScore | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT date::text as date, score, position, indicators, created_at::text as created_at FROM macro_scores ORDER BY date DESC LIMIT 1"
    );
    return (res.rows[0] as MacroScore) || null;
  } finally {
    client.release();
  }
}

// ─── Sentiment ───────────────────────────────────────

export async function getSentimentHistory(limit = 60): Promise<SentimentData[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT date::text as date, score, limit_up_count, limit_up_rate, details, created_at::text as created_at FROM sentiment ORDER BY date DESC LIMIT $1",
      [limit]
    );
    return res.rows as SentimentData[];
  } finally {
    client.release();
  }
}

export async function getLatestSentiment(): Promise<SentimentData | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT date::text as date, score, limit_up_count, limit_up_rate, details, created_at::text as created_at FROM sentiment ORDER BY date DESC LIMIT 1"
    );
    return (res.rows[0] as SentimentData) || null;
  } finally {
    client.release();
  }
}

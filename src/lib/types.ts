// Types for database rows
export interface Report {
  id: number;
  type: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MacroScore {
  date: string;
  score: number;
  position: number;
  indicators: Record<string, number> | null;
  created_at: string;
}

export interface SentimentData {
  date: string;
  score: number;
  limit_up_count: number;
  limit_up_rate: number;
  details: Record<string, unknown> | null;
  created_at: string;
}

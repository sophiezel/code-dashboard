// Types for SQLite database rows (all columns are strings from SQLite TEXT storage)
export interface Report {
  id: number;
  type: string;
  title: string | null;
  content: string;
  metadata: string | null;  // JSON string
  created_at: string;
}

export interface MacroScore {
  date: string;
  score: number;
  position: number;
  indicators: string | null;  // JSON string
  created_at: string;
}

export interface SentimentData {
  date: string;
  score: number;
  limit_up_count: number;
  limit_up_rate: number;
  details: string | null;  // JSON string
  created_at: string;
}

export interface ThemePoolStock {
  theme: string;
  segment: string | null;
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  source: string | null;
  comment: string | null;
  update_date: string;
}

export interface ThemePool {
  theme: string;
  stocks: ThemePoolStock[];
}

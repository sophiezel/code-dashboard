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

export interface HsgtStockItem {
  trade_date: string;
  symbol: string;
  direction: string;
  rank: number;
  net_inflow: number;   // 持股市值变化，单位元
  change_pct: number;
}

export interface HsgtSectorItem {
  sector: string;
  total_net_buy: number;
  buy_count: number;
  sell_count: number;
  top_buy_name: string | null;
  top_buy_value: number | null;
}

export interface EtfFlowItem {
  symbol: string;
  name: string;
  etf_type: string;
  pct_change: number;
  fund_size: number;
}

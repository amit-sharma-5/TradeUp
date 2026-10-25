export interface Signal {
  symbol: string;
  name: string;
  category: string;
  ltp: number;
  change_pct: number;
  pivot: number;
  buy_zone_low?: number;          // present on screener rows only
  buy_zone_high?: number;
  stop: number;
  why: string;
  // engine context (present when the SEPA screener produced the row)
  rs?: number;
  rs_bo?: number;
  grade?: string;
  "above_pivot%"?: number;
  "to_pivot%"?: number;
  entry?: string;                 // Breakout / Retest re-entry
  vol_x?: number;
  base_no?: number;
  watch_type?: string;            // Buy-ready / Retesting / Resting / …
  fund?: string;
  bo_type?: string;
}

export interface TradeEvent {
  ts: string;
  event: string;
  price: number | null;
  qty: number | null;
  reason: string;
}

export interface Trade {
  id: string;
  symbol: string;
  status: "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";
  qty: number;
  order_kind: "BUY_STOP" | "LIMIT";
  trigger: number | null;
  entry_price: number | null;
  stop: number | null;
  pivot: number | null;
  exit_price: number | null;
  exit_reason: string;
  note?: string;                  // the trader's notes & lessons
  events: TradeEvent[];
  // Derived by the journal endpoint when knowable:
  last_price?: number;            // OPEN: poller's last known quote
  unrealized_pnl?: number;        // OPEN: (last - entry) * qty
  unrealized_pnl_pct?: number;
  pnl?: number;                   // CLOSED: (exit - entry) * qty
  pnl_pct?: number;
}

export interface Health {
  ok: boolean;
  signal_source: "sepa" | "mock";
  store: "csv" | "sqlite";
  trades: number;
  signals: { asof: string; status: string; refreshing: boolean; count: number };
  scheduler: { last_run: string; scan_times: string[]; running: boolean };
  quote_poller: { interval_s: number; last_poll: string; last_error: string };
}

const base = "";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(base + path);
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

export class UnauthorizedError extends Error {}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json();
}

export const api = {
  health: () => get<Health>("/api/health"),
  candidates: () => get<Signal[]>("/api/candidates"),
  journal: () => get<{ trades: Trade[] }>("/api/journal"),
  refreshSignals: () => post<{ started: boolean }>("/api/signals/refresh"),
  login: (passphrase: string) => post<{ ok: boolean }>("/api/login", { passphrase }),
  placeOrder: (o: { symbol: string; kind: string; qty: number; limit_price: number; stop: number }) =>
    post<{ trade_id: string; status: string }>("/api/orders", o),
  cancelOrder: (id: string) => post<{ trade_id: string; status: string }>(`/api/orders/${id}/cancel`),
  moveStop: (id: string, stop: number) => post<{ trade_id: string; stop: number }>(`/api/orders/${id}/stop`, { stop }),
  recordExit: (id: string, price: number, reason: string) =>
    post<{ trade_id: string; exit_price: number }>(`/api/orders/${id}/exit`, { price, reason }),
  setNote: (id: string, note: string) => post<{ trade_id: string; note: string }>(`/api/journal/${id}`, { note }),
  chart: (symbol: string, tf: "daily" | "weekly" = "daily") =>
    get<ChartData>(`/api/chart/${symbol}?tf=${tf}`),
  symbols: () => get<StockSymbol[]>("/api/symbols"),
  runBacktest: (p: { start?: string; stop_pct?: number; chase_pct?: number; max_pos?: number; grade?: string }) =>
    post<{ started: boolean; running: boolean; status: string }>("/api/backtest", p),
  backtestStatus: () => get<BacktestStatus>("/api/backtest"),
  settings: () => get<TraderSettings>("/api/settings"),
  saveSettings: (s: Partial<TraderSettings>) => put<TraderSettings>("/api/settings", s),
  profiles: () => get<{ profiles: RuleProfile[]; active: string }>("/api/profiles"),
  saveProfile: (name: string, params: RuleProfileParams) =>
    post<{ profiles: RuleProfile[]; active: string }>("/api/profiles", { name, params }),
  deleteProfile: async (name: string) => {
      const r = await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (r.status === 401) throw new UnauthorizedError();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
      return r.json() as Promise<{ profiles: RuleProfile[] }>;
    },
  dhanStatus: () => get<DhanStatus>("/api/secrets/dhan"),
  saveDhan: (client_id: string, access_token: string) =>
    post<DhanStatus>("/api/secrets/dhan", { client_id, access_token }),
  ticket: (symbol: string, o?: { entry?: number; stop?: number; equity?: number }) => {
    const q = new URLSearchParams();
    if (o?.entry) q.set("entry", String(o.entry));
    if (o?.stop) q.set("stop", String(o.stop));
    if (o?.equity) q.set("equity", String(o.equity));
    return get<TicketPlan>(`/api/ticket/${symbol}?${q}`);
  },
  watchlists: () => get<Watchlists>("/api/watchlists"),
  news: (symbol: string) => get<NewsItem[] | { error: string }>(`/api/news/${symbol}`),
  journalCsv: () => "/api/journal.csv" as string,
  stockedge: () => get<StockEdgeStatus>("/api/stockedge"),
  watchlist: () => get<{ symbols: WatchRow[] }>("/api/watchlist"),
  addWatch: (symbol: string) => post<{ symbols: string[] }>("/api/watchlist", { symbol }),
  removeWatch: (symbol: string) =>
    fetch(`/api/watchlist/${symbol}`, { method: "DELETE" }).then((r) => {
      if (r.status === 401) throw new UnauthorizedError();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ symbols: string[] }>;
    }),
  uploadStockedge: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const doFetch = async () => {
      const r = await fetch("/api/stockedge/upload", { method: "POST", body: form });
      if (r.status === 401) throw new UnauthorizedError();
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
      return r.json() as Promise<{ saved: string; refresh_started: boolean; note: string }>;
    };
    return doFetch();
  },
};

export interface StockEdgeFile { name: string; size_kb: number; modified: string; }
export interface WatchRow { symbol: string; name: string; ltp: number | null; change_pct: number | null; }
export interface StockEdgeStatus {
  files: StockEdgeFile[];
  latest: { file?: string; rows?: number; symbols?: number | null; se_date?: string | null; error?: string };
}

export interface TraderSettings {
  equity: number; risk_pct: number; max_pos_pct: number;
  auto_paper: boolean; active_profile: string;
}
export interface RuleProfile {
  name: string; stop_pct?: number; chase_pct?: number; min_grade?: string; max_pos?: number;
}
export interface RuleProfileParams {
  stop_pct?: number; chase_pct?: number; min_grade?: string; max_pos?: number;
}
export interface DhanStatus { client_id: string; token: string; configured: boolean; }
export interface TicketPlan {
  pivot: number; entry: number; stop: number; stop_pct: number; qty: number;
  value: number; risk_rs: number; risk_pct_eq: number; pos_pct_eq: number;
  capped: boolean; r2: number; r3: number; problems: string[]; name: string; ltp: number | null;
}
export interface WatchlistRow { symbol: string; close?: number; rs?: number; stage?: number; tt?: boolean; setup?: string; cycle?: string; signal?: string; note?: string; why?: string; [k: string]: unknown; }
export interface Watchlists {
  asof: string; stale?: boolean;
  "Uptrend (no base)": WatchlistRow[];
  "Leaders": WatchlistRow[];
  "Sell-Avoid": WatchlistRow[];
  "Earnings x Tech": WatchlistRow[];
  "Market": Record<string, unknown>[];
}
export interface NewsItem { date: string; source: string; title: string; link: string; tags: string; }

async function put<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 401) throw new UnauthorizedError();
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
  return r.json();
}

export interface StockSymbol { symbol: string; name: string; industry: string; }

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface LinePoint { date: string; value: number; }
export interface ChartData {
  symbol: string;
  benchmark_source: string;
  tf: "daily" | "weekly";
  candles: Candle[];
  ma50?: LinePoint[];
  ma200?: LinePoint[];
  ma10w?: LinePoint[];
  ma30w?: LinePoint[];
  ma40w?: LinePoint[];
  pivot: number | null;
  stop: number | null;
  stage: number;
  rs: number | null;
  tt: boolean;
  breakouts: { date: string; price: number; type: string }[];
}

export interface BacktestStats {
  trades: number; "win%": number; "avg gain%": number; "avg loss%": number;
  "gain/loss": number; "expectancy%": number; "median%": number;
  "profit factor": number; "avg bars": number; "fwd60%": number;
}
export interface BacktestResult {
  asof: string;
  start: string;
  params: { stop_pct: number; chase_pct: number; max_pos: number; min_grade: string };
  benchmark_source: string;
  stocks: number;
  breakouts: number;
  summary: (BacktestStats & { set: string })[];
  breakdowns: Record<string, Record<string, number | string | null>[]>;
  portfolio: {
    "CAGR%": number | null; "max DD%": number | null; "avg invested%": number | null;
    "Nifty 500 CAGR%": number | null; "Nifty 500 max DD%": number | null;
    years: number | null;
    curve: { date: string; equity: number; invested: number }[];
  };
}
export interface BacktestStatus {
  running: boolean;
  status: string;
  has_result: boolean;
  result: BacktestResult | null;
}

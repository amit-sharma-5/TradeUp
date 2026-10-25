/** Typed API client — the only place the frontend talks to the backend.
 *  One request helper: JSON in/out, 401 → UnauthorizedError, other errors carry
 *  the server's `detail` message so the UI can show something useful. */

export class UnauthorizedError extends Error {}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json", ...(init.headers || {}) }
      : init.headers,
  });
  if (r.status === 401) throw new UnauthorizedError("login required");
  if (!r.ok) {
    const detail = await r.json().then((j) => j?.detail).catch(() => null);
    throw new Error(typeof detail === "string" ? detail : `${path}: HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}
const get = <T>(p: string) => req<T>(p);
const send = <T>(method: string, p: string, body?: unknown) =>
  req<T>(p, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/* ── domain types (mirror backend/app/domain.py + endpoint shapes) ───────── */

export interface Signal {
  symbol: string;
  name: string;
  category: string;               // "Strong Buy" | "Buy" | "Watch"
  ltp: number;
  change_pct: number;
  pivot: number;
  buy_zone_low?: number;
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

export interface TradeEvent { ts: string; event: string; price: number | null; qty: number | null; reason: string; }

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
  note?: string;
  events: TradeEvent[];
  last_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_pct?: number;
  pnl?: number;
  pnl_pct?: number;
}

export interface Health {
  ok: boolean;
  auth_required?: boolean;
  signal_source: "sepa" | "mock";
  store: "csv" | "sqlite";
  trades: number;
  signals: { asof: string; status: string; refreshing: boolean; count: number };
  scheduler: { last_run?: string; scan_times?: string[]; running: boolean };
  quote_poller: { interval_s?: number; last_poll?: string; last_error?: string; running?: boolean };
}

export interface StockSymbol { symbol: string; name: string; industry: string; }
export interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number; }
export interface LinePoint { date: string; value: number; }
export interface ChartData {
  symbol: string;
  benchmark_source: string;
  tf: "daily" | "weekly";
  candles: Candle[];
  ma50?: LinePoint[]; ma200?: LinePoint[];
  ma10w?: LinePoint[]; ma30w?: LinePoint[]; ma40w?: LinePoint[];
  pivot: number | null;
  stop: number | null;
  stage: number | null;
  rs: number | null;
  tt: boolean;
  breakouts: { date: string; price: number; type: string }[];
}

export interface TicketPlan {
  pivot: number; entry: number; stop: number; stop_pct: number; qty: number;
  value: number; risk_rs: number; risk_pct_eq: number; pos_pct_eq: number;
  capped: boolean; r2: number; r3: number; problems: string[]; name?: string; ltp?: number | null;
}

export interface StockDetail {
  symbol: string;
  status: {
    close: number | null; stage: number | null; tt: boolean; rs: number | null;
    rs_line_new_high: boolean; setup: string | null; pivot: number | null;
    off_high_pct: number | null; ext50_pct: number | null; vol_x: number | null;
    turnover_cr: number | null; base_count_stage2: number | null; lists: string[];
  };
  checklist: { rule: string; ok: boolean; detail: string }[];
  plan: TicketPlan | null;
  breakouts: { date: string; type: string; pivot: number | null; vol_x: number | null;
               base_no: number | null; since_pct: number | null; violations: string[] }[];
  fundamentals: Record<string, string | number | boolean>;
  my_trades: Trade[];
}

export interface Holding {
  id: string; symbol: string; action: string; why: string;
  entry: number; last: number | null; stop: number | null; qty: number;
  ret_pct: number | null; r_now: number | null; pnl: number | null; since: string | null;
}

export interface JournalStats {
  closed_trades: number; win_pct?: number; avg_gain_pct?: number; avg_loss_pct?: number;
  gain_loss_ratio?: number | null; expectancy_pct?: number; avg_r?: number | null;
  total_pnl?: number; auto_trades?: number;
}

export interface WatchlistRow {
  symbol: string; close?: number; rs?: number; stage?: number; tt?: boolean;
  setup?: string; cycle?: string; signal?: string; note?: string; why?: string;
  [k: string]: unknown;
}
export interface Watchlists {
  asof: string; stale?: boolean;
  "Uptrend (no base)"?: WatchlistRow[];
  "Leaders"?: WatchlistRow[];
  "Sell-Avoid"?: WatchlistRow[];
  "Earnings x Tech"?: WatchlistRow[];
  "Market"?: { measure: string; value: number }[];
}
export interface WatchRow { symbol: string; name: string; ltp: number | null; change_pct: number | null; }
export interface NewsItem { date: string; source: string; title: string; link: string; tags: string; }

export interface SectorMember {
  symbol: string; close: number; "1D": number | null; "1M": number | null;
  rs: number | null; stage: number | null; tt: boolean; setup: string;
}
export interface SectorRow {
  industry: string; stocks: number;
  "1D"?: number | null; "1W"?: number | null; "1M"?: number | null;
  "3M"?: number | null; "1Y"?: number | null; "5Y"?: number | null;
  "above50%": number; "stage2%": number; "tt%": number; "setup%": number;
  members: SectorMember[];
}
export interface Sectors { asof: string; stale?: boolean; sectors: SectorRow[]; }

export interface TraderSettings {
  equity: number; risk_pct: number; max_pos_pct: number;
  auto_paper: boolean; active_profile: string;
}
export interface RuleProfileParams { stop_pct?: number; chase_pct?: number; min_grade?: string; max_pos?: number; }
export interface RuleProfile extends RuleProfileParams { name: string; }
export interface DhanStatus { client_id: string; token: string; configured: boolean; }

export interface StockEdgeFile { name: string; size_kb: number; modified: string; }
export interface StockEdgeStatus {
  files: StockEdgeFile[];
  latest: { file?: string; rows?: number; symbols?: number | null; se_date?: string | null; error?: string };
}

export interface DataStatus {
  source: string; sepa_root?: string; price_files?: number; prices_updated?: string | null;
  scan?: { asof: string; status: string; refreshing: boolean; count: number };
  universe_size?: number | null;
  scheduler?: { scan_times?: string[]; last_run?: string } | null;
  quote_poller?: { interval_s?: number; last_poll?: string; last_error?: string } | null;
  store?: string; journal_trades?: number;
}

export interface BacktestStats {
  trades: number; "win%": number; "avg gain%": number; "avg loss%": number;
  "gain/loss": number; "expectancy%": number; "median%": number;
  "profit factor": number; "avg bars": number; "fwd60%": number;
}
export interface BacktestResult {
  id?: string; label?: string; profile?: string | null;
  asof: string; start: string;
  data_from?: string; first_trade?: string | null; start_clipped?: boolean;
  params: { stop_pct: number; chase_pct: number; max_pos: number; min_grade: string };
  benchmark_source: string; stocks: number; breakouts: number;
  summary: (BacktestStats & { set: string })[];
  breakdowns: Record<string, ({ group: string } & Record<string, number | string | null>)[]>;
  portfolio: {
    "CAGR%": number | null; "max DD%": number | null; "avg invested%": number | null;
    "Nifty 500 CAGR%": number | null; "Nifty 500 max DD%": number | null;
    years: number | null;
    curve: { date: string; equity: number; invested: number }[];
  };
  trades?: Record<string, string | number | null>[];
}
export interface BacktestStatus { running: boolean; status: string; has_result: boolean; result: BacktestResult | null; }
export interface BacktestRun {
  id: string; label: string; profile: string | null; start: string; asof: string;
  params: BacktestResult["params"]; trades: number; "win%": number; "expectancy%": number;
  "CAGR%": number | null; "max DD%": number | null;
}

/* ── endpoints ───────────────────────────────────────────────────────────── */

export const api = {
  // session
  session: () => get<{ auth_enabled: boolean; authenticated: boolean }>("/api/session"),
  login: (passphrase: string) => send<{ ok: boolean }>("POST", "/api/login", { passphrase }),
  logout: () => send<{ ok: boolean }>("POST", "/api/logout"),
  health: () => get<Health>("/api/health"),

  // markets
  candidates: () => get<Signal[]>("/api/candidates"),
  refreshSignals: () => send<{ started: boolean }>("POST", "/api/signals/refresh"),
  watchlists: () => get<Watchlists>("/api/watchlists"),
  sectors: () => get<Sectors>("/api/sectors"),
  symbols: () => get<StockSymbol[]>("/api/symbols"),
  watchlist: () => get<{ symbols: WatchRow[] }>("/api/watchlist"),
  addWatch: (symbol: string) => send<{ symbols: string[] }>("POST", "/api/watchlist", { symbol }),
  removeWatch: (symbol: string) => send<{ symbols: string[] }>("DELETE", `/api/watchlist/${encodeURIComponent(symbol)}`),

  // one stock
  stock: (symbol: string) => get<StockDetail>(`/api/stock/${encodeURIComponent(symbol)}`),
  chart: (symbol: string, tf: "daily" | "weekly" = "daily") =>
    get<ChartData>(`/api/chart/${encodeURIComponent(symbol)}?tf=${tf}`),
  news: (symbol: string) => get<NewsItem[] | { error: string }>(`/api/news/${encodeURIComponent(symbol)}`),
  ticket: (symbol: string, o?: { entry?: number; stop?: number }) => {
    const q = new URLSearchParams();
    if (o?.entry) q.set("entry", String(o.entry));
    if (o?.stop) q.set("stop", String(o.stop));
    return get<TicketPlan>(`/api/ticket/${encodeURIComponent(symbol)}?${q}`);
  },

  // orders & journal
  placeOrder: (o: { symbol: string; kind: string; qty: number; limit_price: number; stop: number }) =>
    send<{ trade_id: string; status: string }>("POST", "/api/orders", o),
  cancelOrder: (id: string) => send<{ trade_id: string; status: string }>("POST", `/api/orders/${id}/cancel`),
  moveStop: (id: string, stop: number) => send<{ trade_id: string; stop: number }>("POST", `/api/orders/${id}/stop`, { stop }),
  recordExit: (id: string, price: number, reason: string) =>
    send<{ trade_id: string; exit_price: number }>("POST", `/api/orders/${id}/exit`, { price, reason }),
  setNote: (id: string, note: string) => send<{ trade_id: string; note: string }>("PATCH", `/api/journal/${id}`, { note }),
  journal: () => get<{ trades: Trade[] }>("/api/journal"),
  journalStats: () => get<JournalStats>("/api/journal/stats"),
  holdings: () => get<{ holdings: Holding[]; stale?: boolean }>("/api/holdings"),
  journalCsvUrl: "/api/journal.csv",

  // research
  runBacktest: (p: { start?: string; stop_pct?: number; chase_pct?: number; max_pos?: number; grade?: string; profile?: string }) =>
    send<{ started: boolean; running: boolean; status: string }>("POST", "/api/backtest", p),
  backtestStatus: () => get<BacktestStatus>("/api/backtest"),
  backtestRuns: () => get<{ runs: BacktestRun[] }>("/api/backtest/runs"),
  loadBacktestRun: (id: string) => send<BacktestStatus>("POST", `/api/backtest/runs/${id}/load`),
  deleteBacktestRun: (id: string) => send<{ runs: BacktestRun[] }>("DELETE", `/api/backtest/runs/${id}`),
  backtestCsvUrl: "/api/backtest/trades.csv",
  profiles: () => get<{ profiles: RuleProfile[]; active: string }>("/api/profiles"),
  saveProfile: (name: string, params: RuleProfileParams) =>
    send<{ profiles: RuleProfile[]; active: string }>("POST", "/api/profiles", { name, params }),
  deleteProfile: (name: string) =>
    send<{ profiles: RuleProfile[] }>("DELETE", `/api/profiles/${encodeURIComponent(name)}`),

  // settings & data
  settings: () => get<TraderSettings>("/api/settings"),
  saveSettings: (s: Partial<TraderSettings>) => send<TraderSettings>("PUT", "/api/settings", s),
  dhanStatus: () => get<DhanStatus>("/api/secrets/dhan"),
  saveDhan: (client_id: string, access_token: string) =>
    send<DhanStatus>("POST", "/api/secrets/dhan", { client_id, access_token }),
  data: () => get<DataStatus>("/api/data"),
  stockedge: () => get<StockEdgeStatus>("/api/stockedge"),
  uploadStockedge: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return req<{ saved: string; refresh_started: boolean; note: string }>(
      "/api/stockedge/upload", { method: "POST", body: form });
  },
};
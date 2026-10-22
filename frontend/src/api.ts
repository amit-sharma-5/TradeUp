export interface Signal {
  symbol: string;
  name: string;
  category: string;
  ltp: number;
  change_pct: number;
  pivot: number;
  buy_zone_low: number;
  buy_zone_high: number;
  stop: number;
  why: string;
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
  scheduler: { last_run: string; scan_time: string; running: boolean };
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
};

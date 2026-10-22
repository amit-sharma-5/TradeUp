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
  entry_price: number | null;
  stop: number | null;
  exit_price: number | null;
  exit_reason: string;
  events: TradeEvent[];
}

const base = "";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

export const api = {
  candidates: () => get<Signal[]>("/api/candidates"),
  journal: () => get<{ trades: Trade[] }>("/api/journal"),
  placeOrder: async (o: { symbol: string; kind: string; qty: number; limit_price: number; stop: number }) => {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(o),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
    return r.json() as Promise<{ trade_id: string; status: string }>;
  },
};

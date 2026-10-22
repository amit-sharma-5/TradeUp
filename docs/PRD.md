# TradeUp — Product Requirements (PRD)

**Version:** 0.1 (greenfield) · **Owner:** Amit · **Status:** draft for review

---

## 1. What TradeUp is

A **personal paper-trading terminal for Indian equities (NSE)**. It watches the market, tells you when a stock matches a proven set of buy criteria, lets you place a **paper order** (play-money trade), and shows you exactly **what happened** to every trade you took — so you can learn to trade with zero financial risk before ever using real money.

**The core loop (the product):**

```
see candidates → decide → place paper order → it fills (or not) →
it plays out (stop loss / target / exit) → review what happened
```

**Design principle: simple and clean.** One screen per decision, one obvious action per screen. Reference feel: **Groww / Zerodha** — light theme, generous white space, one green accent for "up/buy", red for "down/sell", cards and plain tables, no dense terminal grids. The user is **new to trading**: every number should be understandable via the help guide (docs/TRADING-GUIDE.md), and every row should say *why* it is a candidate in plain words.

## 2. Who it's for

One user (Amit). Not multi-tenant, not a SaaS. Real orders are **out of scope** until the paper process is trusted — when added, they arrive behind an explicit switch with a preview → confirm step (Phase 4).

## 3. MVP scope (Phase 1)

| # | Screen | What the user sees / does |
|---|---|---|
| 1 | **Candidates** (home) | Cards, not a dense grid. Each card: symbol + company name, price + day change, a **plain-English reason** ("in a strong uptrend, consolidating tightly, breakout buy point ₹1,135 (+2% zone)"), and a **Trade** button. Grouped: Strong Buy / Buy / Watch. |
| 2 | **Trade ticket** | From a candidate (or manual symbol search): quantity (with suggested size from the risk rule), entry type (buy-stop / limit), stop-loss (pre-filled). Preview → Confirm. Creates a **paper order**. |
| 3 | **Journal** (what happened) | Open paper trades with live P&L; closed trades with entry/exit/reason; **every trade shows its event timeline** (placed → filled → stop moved → stopped out → exited) with timestamps, prices and reasons. This screen is the product's most important output: the honest record of what paper trading did. |

**MVP behaviours:**
- Paper orders fill from live/last prices during market hours; outside market hours they stay "planned".
- Buy-stop orders cancel automatically if price runs above the chase limit (same rule as the reference engine) — and the cancellation **appears in the timeline with the reason**.
- Stop-loss exits fill automatically when price touches the stop.
- Daily candidates refresh from the analysis engine; the "why" text comes with each row.
- Daily report: a one-screen "Yesterday / today" summary in the Journal (new signals, fills, stops, closed P&L).

**Out of scope for Phase 1 (deliberately):** authentication, a database, backtesting UI, sector view, StockEdge imports, news, Telegram, desktop packaging, real orders. See §6.

## 4. Success criteria

1. I can, on my phone or laptop, open TradeUp and know **within 10 seconds** whether anything is worth buying today, and why.
2. Every paper trade's full lifecycle is visible and auditable — I can answer "what happened?" for any trade, weeks later, without reading code or logs.
3. Nothing places a real order — provable by code inspection (a single `Broker` interface with only a paper implementation).
4. Tests cover the money paths (order fill rules, journal state machine) and pass in CI.

## 5. UI direction

- **Library:** Material UI (MUI) on React + TypeScript + Vite.
- **Reference:** Groww (cards, big numbers, green/red), Zerodha Kite (watchlist simplicity).
- Mobile-first layouts (cards stack, tables become lists); desktop gets the same content in wider grids. No terminal-style 20-column tables in v1.

## 6. Phases

| Phase | Theme | Contents |
|---|---|---|
| **1 — MVP web** | The loop works | Candidates + Ticket + Journal (event timeline), CSV store, localhost, no auth, mock-or-real signal source behind an interface |
| **2 — Persistence** | Trustworthy history | SQLite (trades, trade_events, settings, signals history); price store stays file-based; decide auth approach |
| **3 — Deploy & phone** | Available anywhere | Host privately (Oracle free tier or home box), HTTPS, PWA/responsive pass, notifications |
| **4 — Real money (gated)** | Only when paper works | Live broker behind the same `Broker` interface, `LIVE_ORDERS=off` default, preview→confirm, explicit owner sign-off |

## 7. Open questions (to clarify with "product" = owner)

1. Which signal source for v1 — the existing SEPA engine (imported as a library) or simplified rules re-derived from scratch?
2. Universe: Nifty 500 only?
3. Notification channel priority: in-app → push (PWA) → Telegram?
4. Position-sizing rule for the ticket's suggested quantity (fixed risk ₹ per trade ÷ stop distance?).
5. Auth: none while localhost-only; before Phase 3 decide passphrase + session cookie vs. VPN-only access.

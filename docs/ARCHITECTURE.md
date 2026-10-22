# TradeUp — Architecture

Greenfield rebuild of the ideas proven in `../SEPA-terminal` (see its `ARCHITECTURE.md` and `HANDOVER.md` for context and non-negotiables). This doc defines the clean version: simple, testable, event-sourced, with the trading rules treated as **a library we import, not logic we rewrite**.

---

## 1. Guiding decisions (and why)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Reuse the SEPA engine as a library.** `sepa/engine.py`, `patterns.py`, `screener.py`, `params.py`, `trading.py` are imported, not ported. | The rules are validated against Minervini's books and the original TradingView indicator; there are no tests to verify a rewrite. Porting risk > integration cost. |
| D2 | **Event-sourced journal from day 1.** Every state change of a trade is an appended `trade_events` row. | "Show what paper trading happened" is the product's core promise (PRD §4.2). The old app stored final state only and lost the story. |
| D3 | **CSV now, SQLite later, one storage interface.** | Phase 1 has no auth and runs on one machine; CSVs are inspectable. The `Store` interface lets Phase 2 swap in SQLite without touching business code. |
| D4 | **Single `Broker` interface; only `PaperBroker` exists.** | Provable safety: no code path can place a real order until a `LiveBroker` class is written, reviewed and gated. |
| D5 | **Backend keeps the signals; the client is dumb.** | The phone/browser renders JSON. No business logic in the client = one place to test. |
| D6 | **No auth in Phase 1** (localhost only). Auth designed in Phase 2, required before any non-localhost access. | Simplicity now; a documented upgrade path later (§7). |

## 2. System shape

```
┌────────────────────────────── one machine ──────────────────────────────┐
│                                                                         │
│  React + TypeScript + MUI (frontend/)      FastAPI (backend/)           │
│  3 screens: Candidates · Trade · Journal   ├─ /api/*  REST              │
│        │  fetch / WS later                 ├─ PaperBroker  (fills)      │
│        └────────── proxy ───────────────►  ├─ Scheduler    (daily jobs) │
│                                            ├─ Store iface  (CSV→SQLite) │
│                                            └─ engine/  (imported SEPA   │
│                                               package, untouched)       │
│                                                                         │
│  data/  prices/*.csv · journal/trades.csv · events.csv · settings.json  │
└─────────────────────────────────────────────────────────────────────────┘
        ▲ Dhan REST/WebSocket (prices, ticks)      ▲ Yahoo fallback
```

## 3. Backend layout (`backend/`)

```
backend/
├── app/
│   ├── main.py          FastAPI app, routers, static serving (later)
│   ├── api/             routes: candidates.py · trades.py · health.py
│   ├── domain/          dataclasses: Signal · Order · Trade · TradeEvent
│   ├── broker/          base.py (Broker ABC) · paper.py (PaperBroker)
│   ├── store/           base.py (Store ABC) · csv_store.py · (sqlite.py — Phase 2)
│   ├── signals/         adapter.py — wraps the imported sepa package behind
│   │                    an interface: get_candidates() -> list[Signal]
│   ├── feed/            price source adapter (Yahoo first; Dhan later)
│   └── jobs/            daily update + scheduled scan (thread/APScheduler)
└── tests/               pytest: broker fills, journal FSM, API contract, golden signals
```

**Domain model (start):**

```python
Signal    = {symbol, name, category(STRONG_BUY|BUY|WATCH), ltp, change_pct,
             pivot, buy_zone_low, buy_zone_high, stop, why: str}
Order     = {id, trade_id, symbol, kind(BUY_STOP|LIMIT), qty, limit_price, placed_at, status}
Trade     = {id, symbol, status(PLANNED|OPEN|CLOSED|CANCELLED), qty, entry_price,
             stop, exit_price, exit_reason, opened_at, closed_at}
TradeEvent= {id, trade_id, ts, event, price, qty, reason}   # append-only, never edited
```

**PaperBroker fill rules (ported verbatim from the proven engine, `sepa/broker.py`):**
- `BUY_STOP`: fills at LTP when LTP ≥ trigger; if the first qualifying tick is beyond pivot + chase %, **cancel with reason**.
- `LIMIT`: fills when LTP ≤ limit.
- Open trade: closes at LTP when LTP ≤ stop.
- Every action above emits a `TradeEvent` **and** is the subject of unit tests.

## 4. Frontend layout (`frontend/`)

```
frontend/src/
├── main.tsx · App.tsx        MUI theme (light, green/red accents), bottom nav on mobile
├── api.ts                    typed fetch client
├── types.ts                  mirrors backend domain model
└── pages/
    ├── CandidatesPage.tsx    cards grouped Strong Buy / Buy / Watch; "Trade" → ticket
    ├── TradePage.tsx         ticket: qty (suggested), entry kind, stop; preview → confirm
    └── JournalPage.tsx       open trades (live P&L) · closed trades · per-trade event timeline
```

Live updates: Phase 1 polls every few seconds; Phase 3 adds a WebSocket for ticks/alerts (the client already has a single `api.ts` seam).

## 5. Data & storage

- **Prices:** one CSV per symbol (same format as the reference store) in `data/prices/`; Yahoo ingestion works with no API key, Dhan adapter added when the owner's token is available.
- **Journal:** `data/journal/trades.csv` + `data/journal/events.csv` (append-only). Atomic writes (write-temp-then-rename).
- **Settings:** `data/settings.json`.
- **Phase 2 (SQLite):** swap `Store` implementation; prices stay file-based. Table set: `trades`, `trade_events`, `signals_history`, `settings`.

## 6. Testing strategy (CI from the first commit)

1. **Broker fill rules** — buy-stop fill, chase-limit cancel, limit fill, stop-out (the money paths).
2. **Journal state machine** — legal transitions only; every transition emits exactly one event.
3. **API contract** — FastAPI TestClient: auth (when it exists), order flow, journal read model.
4. **Golden signal tests** — fixed price input → frozen signal snapshot; protects the rules from drift.
5. **Seeded E2E** — signal → order → fill → stop-out → journal timeline shows the full story with correct P&L.

No test touches the live internet: fixtures are recorded files.

## 7. Auth & DB — open design notes (Phase 2)

**Other reasons a DB earns its keep** (beyond the journal): signals history ("what did it say last Tuesday?"), backtest runs, alert history, settings versioning, and atomicity under concurrent writes. Prices stay as files either way.

**Auth options for a single user** (to decide in Phase 2, before any non-localhost exposure):
1. **Passphrase + session cookie** — Argon2 hash of one passphrase in config; login issues an HttpOnly+Secure+SameSite=Strict signed cookie; check on every route + the WS upgrade. Simple, adequate.
2. **Tailscale-only access** — no app-level auth; the network is the boundary. Even simpler; combine with (1) as defence-in-depth.
3. Full user accounts / OAuth — rejected: single-user overkill.

**Non-negotiable carried over:** real orders stay OFF by default, two-step confirm, and the Dhan token never leaves the server (it appears in WebSocket URLs — never logged, never shipped to any client).

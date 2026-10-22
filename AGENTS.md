# TradeUp — project context for AI sessions

Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/TRADING-GUIDE.md` for full detail. This file is the working summary.

## What this is

TradeUp: a personal paper-trading terminal for NSE equities. Core loop: **signal → decision → paper order → outcome → review**. Greenfield rebuild of the ideas proven in the sibling repo `../SEPA-terminal` (read its `ARCHITECTURE.md` / `HANDOVER.md` if engine questions come up).

## Current state (Phase 1, started 2026-10-22)

Working end-to-end with real signals, verified:

- `backend/` — FastAPI (`uvicorn app.main:app --reload --port 8000` from `backend/`).
  Signals: real SEPA engine via `signals/adapter.py` when `../SEPA-terminal` exists
  (else mock fallback). Journal: CSV (`data/journal/trades.csv` + `events.csv`),
  event-sourced, atomic writes. PaperBroker with the proven fill rules.
  Endpoints: `/api/health`, `/api/candidates`, `POST /api/orders`,
  `POST /api/orders/{id}/cancel`, `/api/journal`, `POST /api/signals/refresh`,
  `POST /api/signals/run-daily-job`. Daily scheduler thread (17:30 default).
- `frontend/` — Vite + React + TypeScript (strict) + **MUI**, Groww-style green accent, mobile-first (bottom nav), 3 pages: Candidates (cards with plain-English "why") → Trade ticket → Journal with event timelines. `npm run dev` proxies `/api` → :8000.
- CI: pytest + frontend build (`.github/workflows/ci.yml`). Tests: 45 pytest in `backend/tests/`.

## Non-negotiables

1. **No real orders, ever, in this phase.** Only a `PaperBroker` behind the `Broker` interface (docs/ARCHITECTURE.md D4).
2. **No auth in Phase 1** (localhost only) — deliberate decision, revisit in Phase 2 (options in ARCHITECTURE §7).
3. **Trading rules are imported, not rewritten** — the SEPA engine (`../SEPA-terminal/sepa/`: `engine.py`, `params.py`, `screener.py`, `trading.py`, `broker.py`) will be wrapped behind a `SignalSource` adapter, never ported blind.
4. **Event-sourced journal from day 1** — every trade transition appends a `TradeEvent` (D2). Never store final state only.
5. Secrets never in code or git; `.env` is git-ignored.

## Immediate backlog (suggested order)

1. ~~Tests + CI~~ **Done (2026-10-22):** backend split into modules matching ARCHITECTURE §3
   (`domain.py` with the trade FSM, `broker/{base,paper}.py` — fill rules ported verbatim from
   `sepa/broker.py`, `store/{base,memory}.py`, `signals/mock.py`, thin `main.py` app factory);
   33 pytest tests (`backend/tests/`: fills, FSM, API contract); CI in `.github/workflows/ci.yml`
   (pytest + frontend build). Note: frontend types live in `src/api.ts`, not `src/types.ts`.
2. ~~CSV store~~ **Done (2026-10-22):** `store/csv_store.py` implements `Store`
   (trades.csv snapshot + append-only events.csv, atomic write-temp-then-rename,
   replay on load). 45 tests. Also done in the same session:
   - `signals/adapter.py` — `SepaSignalSource` imports the real SEPA engine from
     `SEPA_ROOT` (default `../SEPA-terminal`, see `app/config.py`), runs
     `scan.run_all` → `attach_cross` → `screener.screen`, maps Strong Buy / Buy /
     Watch rows to `Signal`. Reads SEPA's own price store (full NSE history, warm
     cache — no first-time download). `/api/candidates` serves the last snapshot
     and auto-kicks a background scan when empty; `POST /api/signals/refresh`;
     `POST /api/signals/run-daily-job` (Yahoo incremental update for NIFTY 500 +
     scan, synchronous/slow). Mock fallback when SEPA absent (CI).
   - `jobs/scheduler.py` — daily job after `TRADEUP_SCAN_TIME` (default 17:30).
   - `feed/dhan.py` — stub only; token must go in backend/.env when built.
   - Engine defaults already filter to current NIFTY 500 (`params.trade_universe`).
3. ~~Signals adapter~~ **Done — see item 2.** Next candidates:
   - Live paper fills: the broker has `on_quotes` but nothing calls it yet — needs
     an intraday price feed (Phase 2 Dhan WS, or a periodic Yahoo quote poll).
   - UI: show signal source/scan status (from `/api/health`), manual refresh button.
4. UI iteration on the three pages (owner is not a frontend expert — keep components simple, prefer MUI defaults).
5. Phase 2: SQLite swap, auth design, PWA/responsive pass.

## Conventions

- Python 3.11, pandas 2.x (not 3.x). Backend stdlib-style: small modules, docstrings explaining "why".
- Frontend: strict TypeScript, functional components, one component per screen in `src/pages/`, shared fetch logic only in `src/api.ts`, types only in `src/types.ts` (mirror of backend domain model).
- Commits: short imperative subject; body explains the why.
- UI language: plain English, every screen self-explanatory to a new trader (see docs/TRADING-GUIDE.md).

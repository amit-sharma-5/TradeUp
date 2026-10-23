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
3. ~~Signals adapter~~ **Done — see item 2.**
4. ~~Live paper fills~~ **Done (2026-10-22):** `jobs/quote_poller.py` polls Yahoo
   1-min bars (`TRADEUP_QUOTE_INTERVAL`, default 15 s) for active-trade symbols
   only and feeds `broker.on_quotes` — fills/cancels/stop-outs now happen
   automatically. Seeded E2E test (`tests/test_e2e.py`) proves
   order → fill → stop-out → journal with a restart.
5. ~~Phase 2 storage + auth~~ **Done (2026-10-22):**
   - `store/sqlite_store.py` behind the same `Store` interface;
     `TRADEUP_STORE=sqlite` switches (CSV stays default; no auto-migration).
   - `auth.py`: opt-in passphrase + HMAC-signed HttpOnly cookie; dormant until
     `TRADEUP_PASSPHRASE` is set. `/api/login` + middleware; `/api/health` and
     `/api/login` stay open. Frontend shows a login screen on 401.
   - UI: Candidates header shows signal source + scan date, spinner while
     rescanning, manual refresh button.
6. ~~Remaining Phase 2/3~~ **Done (2026-10-22):**
   - Live P&L: `PriceCache` (fed by the poller) + `/api/journal` returns
     `last_price`/`unrealized_pnl(_pct)` for OPEN and `pnl(_pct)` for CLOSED;
     Journal UI shows a P&L chip per trade + a realized-P&L summary chip.
   - Notifications: `jobs/notify.py` — dormant Telegram notifier (env
     `TRADEUP_TELEGRAM_TOKEN` + `TRADEUP_TELEGRAM_CHAT_ID`); poller sends a
     plain-English line per fill/cancel/stop-out; failures never break fills.
   - SQLite auto-import: switching to `TRADEUP_STORE=sqlite` imports the CSV
     journal once (only if the DB is empty — can't duplicate).
   - PWA: manifest + SVG icon + theme color; installable on mobile.
7. ~~Charts + backtest~~ **Done (2026-10-22):**
   - `chartdata.py` + `GET /api/chart/{symbol}`: OHLCV (SEPA price store, with its
     corporate-action fixes) + MA50/MA200 + pivot/stop lines + breakout markers +
     stage/RS/TT chips. `ChartPage.tsx` (lightweight-charts v5), reachable from
     candidate cards and journal trades.
   - `backtester.py` + `POST /api/backtest` / `GET /api/backtest`: runs the imported
     SEPA backtester (SEPA-filtered vs all-breakouts baseline, grade/type/base/reason
     breakdowns, portfolio equity curve) in a background thread. `BacktestPage.tsx`
     with run button + polling. Full run ~10 s warm (1,207 trades since 2012,
     41.6% CAGR / −18.5% max DD on the owner's data). Tests skip without SEPA (CI).
8. ~~Feature parity batch 1~~ **Done (2026-10-22):**
   - Stock search: `/api/symbols` (NIFTY 500 + names) + search mode on the
     Chart tab; `Paper trade` from any chart (orders accept any symbol in the
     price store, chart-derived levels).
   - Trade management: move stop (journaled as stop_moved), manual exit
     (exited event), cancel; notes & lessons on every trade (note column,
     CSV + SQLite with migration).
   - Full screener output: `/api/watchlists` (Uptrend, Leaders, Sell-Avoid,
     Earnings × Tech, Market context) + tabs on the Candidates page.
   - Position sizing: `/api/ticket/{symbol}` calls the imported
     `sepa.trading.plan` (equity × risk% ÷ (entry−stop), max-pos cap, hard
     limits, chase warnings); TradePage prefills qty + shows R multiples.
     Settings (equity/risk) in data/settings.json via /api/settings.
   - News: `/api/news/{symbol}` (engine's Google-RSS fetch, trusted newsrooms)
     shown under the chart.
   - Daily change report: scheduler diffs Strong Buy/Buy/Watch membership vs
     the previous run and sends it to Telegram (dormant without token).
   - `/api/journal.csv` export + Journal button.
9. ~~StockEdge upload page~~ **Done (2026-10-22):** `/api/stockedge` (status:
   files on file + parsed row/symbol/date counts) and `/api/stockedge/upload`
   (validated multipart save into the engine's data/stockedge folder + auto
   rescan). Upload dialog on the Candidates header. StockEdge has no public
   API (checked) — exports remain the sanctioned path; the app just removes
   the file-management friction.
10. ~~One-click launch~~ **Done (2026-10-22):** the backend serves the built
   frontend (`frontend/dist` mounted at `/` — API routes take precedence), so
   the whole app is one process on one port. `start_tradeup.sh` /
   `Start TradeUp.command` (macOS) and `start_tradeup.bat` (Windows): first
   run installs venv + npm packages, builds the frontend when stale, starts
   uvicorn and opens the browser; a second click just opens the running app.
   `TRADEUP_PORT` overrides the port. Non-developers never touch terminals.
11. Left from SEPA-terminal for later: Dhan WebSocket feed + live scanner
   alerts (blocked on the owner's token), Sectors page (industry breadth),
   Excel workbook export, richer chart annotations
   (RS line, stage shading, weekly), golden signal snapshot test.

## Conventions

- Python 3.11, pandas 2.x (not 3.x). Backend stdlib-style: small modules, docstrings explaining "why".
- Frontend: strict TypeScript, functional components, one component per screen in `src/pages/`, shared fetch logic only in `src/api.ts`, types only in `src/types.ts` (mirror of backend domain model).
- Commits: short imperative subject; body explains the why.
- UI language: plain English, every screen self-explanatory to a new trader (see docs/TRADING-GUIDE.md).

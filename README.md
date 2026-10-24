# TradeUp — a clean, simple paper-trading terminal for Indian equities

Signal → decision → paper order → outcome → review. That's the whole product.

- **PRD:** [docs/PRD.md](docs/PRD.md) — scope, phases, open questions
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decisions (D1–D6), layout, testing plan
- **Trading guide (plain English):** [docs/TRADING-GUIDE.md](docs/TRADING-GUIDE.md) — every concept explained for a new trader

## What makes it different

Almost every individual feature here exists in some other app. The point of
TradeUp is the **combination**: it runs *your* validated methodology end to end,
and closes the feedback loop that no commercial product offers.

| Capability | Groww / Zerodha | Chartink | StockEdge | TradingView | Streak | **TradeUp** |
|---|---|---|---|---|---|---|
| Charts, search, paper orders | ✅ | ❌ | ❌ | ✅ (best) | basic | ✅ |
| Stock screeners | basic | ✅ generic | ✅ generic | community | ✅ | ✅ **your exact rules** |
| Your methodology as executable rules (Trend Template, Stage 2, VCP, RS) | ❌ | DIY | ❌ | DIY | DIY | ✅ imported & backtested |
| Backtest of *your exact* parameters (stops, chase, sizing) | ❌ | ❌ | ❌ | paid tiers | generic | ✅ |
| **Decision-time "why" frozen with every trade** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ event-sourced journal |
| **Review loop** — did I follow the system? was the system right? | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ the core product |
| Paper fills using the **same rules as the backtest** | generic | ❌ | ❌ | generic | ✅ | ✅ |
| Private: local data, no subscription, fully hackable | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

The one-sentence version: **other apps tell you what stocks look interesting;
TradeUp is the only tool that runs your validated system, makes you trade it on
paper with identical rules, and then shows you the full story — why you entered,
what happened, and what you should learn.**

Three concrete anchors:
1. **The rules are imported, not invented.** The SEPA engine (Minervini's method
   as recorded and backtested on years of NSE data in the sibling repo) is a
   library here — the screener, sizing and fills all use the same numbers the
   backtest used (e.g. 1,207 simulated trades since 2012: 41.6% CAGR, −18.5% max
   drawdown vs Nifty 500's 12% / −38%).
2. **The journal is event-sourced.** Every trade keeps its decision-time "why",
   every fill/stop-move/exit as an append-only timeline, plus your notes and
   lessons. Reviewing is a first-class feature, not an afterthought.
3. **It's yours.** One machine, your data in plain CSV/SQLite, no cloud, no
   subscription, and every rule threshold is inspectable in one params file.

## Quick start

**One click (recommended):**
- **macOS:** double-click `Start TradeUp.command` (or run `./start_tradeup.sh`)
- **Windows:** double-click `start_tradeup.bat`

The script installs what's missing on first run, builds the app if needed,
starts **one server** and opens **http://127.0.0.1:8000** in your browser.
Closing the terminal window also stops it.

**Stop:** double-click `Stop TradeUp.command` (macOS) / `stop_tradeup.bat`
(Windows) — or just close the server's terminal window. The journal in
`data/journal/` always survives. (Port override: `TRADEUP_PORT=8080`.)

**Manual (developer):** all commands run from the repo root. Python 3.11, Node 18+.

```bash
# one-time setup
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -r backend/requirements-dev.txt
(cd frontend && npm install)

# start (two terminals)
.venv/bin/uvicorn app.main:app --reload --port 8000 --app-dir backend
(cd frontend && npm run dev)        # → http://127.0.0.1:5173 (proxies /api to :8000)

# stop
pkill -f "uvicorn app.main:app"; pkill -f vite

# restart after pulling changes — backend must be restarted even with --reload
# when new modules/packages land; the journal in data/journal/ survives restarts.
```

The Journal (paper trades + events) lives in `data/journal/trades.csv` +
`events.csv` — safe to delete the app, never the data.

**Signals:** if the sibling repo `../SEPA-terminal` exists (configurable via
`SEPA_ROOT`), the app imports its real SEPA engine and reads its price store —
no first-time download. Otherwise it falls back to 3 mock signals. The
Candidates header shows which source is active. The first background scan
starts when you open the Candidates page; it takes a few seconds warm,
a minute or more cold.

**Live paper fills:** while the backend runs, open paper orders are filled,
chase-cancelled or stopped out automatically from polled Yahoo quotes
(every 15 s, only for symbols with active orders). The Journal shows live
unrealized P&L on open trades and realized P&L per closed trade.

## Tests

```bash
.venv/bin/pytest backend -q        # 70 tests: fills, FSM, stores, auth, poller, API
(cd frontend && npm run build)     # also runs in CI on every push
```

## Project layout

```
backend/app/
├── main.py               FastAPI app factory + routes (thin)
├── config.py             paths + env settings (SEPA_ROOT, store kind…)
├── domain.py             Signal/Trade/TradeEvent + the trade state machine
├── auth.py               opt-in passphrase + signed cookie (dormant by default)
├── broker/               base.py (Broker ABC) · paper.py (PaperBroker, fill rules)
├── store/                base.py (Store ABC) · csv_store.py · sqlite_store.py
├── signals/              mock.py · adapter.py (imports the SEPA engine)
├── feed/                 dhan.py (stub — waits for a token in backend/.env)
└── jobs/                 scheduler.py (daily scan) · quote_poller.py (live fills)
                          notify.py (dormant Telegram alerts)
frontend/src/
├── api.ts                typed fetch client + shared types
├── App.tsx               nav + 5 s polling + login gate
└── pages/                Candidates · Trade ticket · Journal · Login
```

## Optional settings

Environment variables, or put them in `backend/.env` (git-ignored — never
commit secrets):

| Variable | Default | What it does |
|---|---|---|
| `SEPA_ROOT` | `../SEPA-terminal` | Where the signal engine + price store live |
| `TRADEUP_STORE` | `csv` | `sqlite` swaps journal storage (auto-imports the CSV journal once) |
| `TRADEUP_PASSPHRASE` | *(unset)* | Setting it turns on login (HttpOnly cookie) |
| `TRADEUP_SCAN_TIME` | `17:30` | Daily price update + scan time |
| `TRADEUP_QUOTE_INTERVAL` | `15` | Seconds between quote polls for paper fills |
| `TRADEUP_TELEGRAM_TOKEN` | *(unset)* | With `TRADEUP_TELEGRAM_CHAT_ID`: Telegram alerts on fills/stop-outs |

## Roadmap

1. ~~**Phase 1:** web MVP — Candidates · Ticket · Journal, CSV store, no auth~~ **done**
2. ~~**Phase 2:** SQLite store option, real signal source (SEPA engine as a library), opt-in auth~~ **done**
3. ~~**Phase 3:** live paper fills, P&L, notifications, installable PWA~~ **done**
4. **Next:** Dhan WebSocket feed (needs a token in `backend/.env`), trade-editing UI, golden signal snapshot test.
5. **Phase 4 (gated):** real orders behind the `Broker` interface + explicit owner sign-off. Paper first, always.

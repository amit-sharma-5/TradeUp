# TradeUp — your trading system, for Indian equities

Signal → decision → paper order → outcome → review. That's the whole product.

- **PRD:** [docs/PRD.md](docs/PRD.md) — scope, phases, open questions
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decisions (D1–D6), layout, testing plan
- **Deployment:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — server, phone access, keeping it private
- **Trading guide (plain English):** [docs/TRADING-GUIDE.md](docs/TRADING-GUIDE.md) — every concept explained for a new trader

## How it compares (honestly)

Rule-based screening, backtesting and paper trading are **not** new.
[QuantConnect](https://www.quantconnect.com/) and
[Streak](https://streak.zerodha.com/) already do them, at a scale TradeUp
doesn't try to match.

| | QuantConnect | Streak (Zerodha) | TradingView / Chartink | **TradeUp** |
|---|---|---|---|---|
| Who it's for | quant developers | retail traders, no-code | chartists / scanners | **one trader and their method** |
| Strategy creation | code (Python/C#), any asset | no-code indicator builder | Pine script / scan builder | **a validated engine + named rule profiles** |
| Backtesting | institutional-grade, multi-asset | yes | paid tiers / limited | yes, on your NSE price store |
| Paper trading | yes | yes | paper / alerts | yes, with the **same fill rules as the backtest** |
| Live / real orders | yes (many brokers) | yes (Zerodha) | via brokers | **deliberately no** (paper only for now) |
| Base patterns (VCP, cup, flat base), Stage analysis, RS ranking, StockEdge-gated earnings | DIY from scratch | hard to express with indicators | partly DIY | **built in** (imported SEPA engine) |
| Decision-time "why" frozen with every trade + notes & lessons | ❌ | ❌ | ❌ | ✅ event-sourced journal |
| Engine verdict on your open positions (Sell / Add / Partial / Hold) | DIY | ❌ | ❌ | ✅ |
| Where your data lives | their cloud | their cloud | their cloud | **your machine**, no subscription |

**Where TradeUp is genuinely different** (narrower than "nobody does this"):
1. **A specific discretionary method, implemented properly.** Minervini's SEPA
   (Trend Template, Stage 2, base detection, pivots, post-breakout violations,
   earnings gates) doesn't fit an indicator builder like Streak's, and on
   QuantConnect you would be rewriting it from scratch. Here it's the imported,
   already-backtested engine.
2. **The review loop.** Each trade keeps the screener's reasoning at the moment
   you entered, its full event history, the engine's verdict on it while it's
   open, and your notes. You can tell whether *you* followed the system, and
   whether *the system* was right.
3. **Private and yours.** One machine, plain files, no subscription. Every
   threshold sits in one params file.

What it is **not**: a multi-asset algo platform, a broker, or a signal-selling
service. QuantConnect is the right tool if you want to code arbitrary
strategies, and Streak if you want no-code strategies with Zerodha execution.

Backtest on the current data (NIFTY 500, price store from 2019): 1,207 SEPA
trades 2020-01 → 2026-10, 41.4% CAGR / −18.5% max drawdown vs Nifty 500
11.8% / −38.3%. Survivorship bias flatters this, because stocks delisted
before today are missing from the store.

## Quick start

**One click (recommended):**
- **macOS:** double-click `Start TradeUp.command` (or run `./start_tradeup.sh`)
- **Windows:** double-click `start_tradeup.bat`

On the first run the script installs what's missing, builds the app if
needed, starts **one server** and opens **http://127.0.0.1:8000** in your
browser.

**Stop:** double-click `Stop TradeUp.command` (macOS) or `stop_tradeup.bat`
(Windows), or close the server window. Your journal in `data/` survives.
To use another port, set `TRADEUP_PORT=8080`.

**Manual (developer):** all commands run from the repo root. Python 3.11, Node 18+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -r backend/requirements-dev.txt
(cd frontend && npm install)

.venv/bin/uvicorn app.main:app --reload --port 8000 --app-dir backend   # API + built app
(cd frontend && npm run dev)        # optional hot-reload UI on :5173 (proxies /api)
pkill -f "uvicorn app.main:app"; pkill -f vite                           # stop
```

**Signals:** if the sibling repo `../SEPA-terminal` exists (set `SEPA_ROOT`
to change the path), the app imports its SEPA engine and reads its price
store, so there is no first-time download. Without it, the app falls back
to 3 mock signals.

## Using it

| Tab | What's there |
|---|---|
| **Today** | Market pulse (Nifty 500 vs its averages, breadth warning), positions needing action, Strong Buy · Buy · Algo Watch with RS / grade / pivot distance / volume / why |
| **Markets** | Sectors (1D–5Y, Stage-2 health, drill into members), Leaders, Uptrend, Sell/Avoid, Earnings × Tech, My Watch |
| **Portfolio** | Positions with the engine's Sell/Add/Partial/Hold verdict, pending orders, closed trades with their full story, TTLC stats, notes, CSV |
| **Research** | Backtest any rule profile, compare saved runs, create / activate rule profiles, trades CSV |
| **Search** | Any NIFTY 500 stock by symbol, company or industry |
| **Stock page** | Daily / Weekly / D+W chart (full screen), Trend Template checklist rule by rule, sized trade plan, breakouts & violations, fundamentals, news, your trades |
| ⚙ / ⋮ | Settings (sizing, ⚡ auto paper, active profile, Dhan keys) · Data & jobs · StockEdge import · About & guide · Sign out |

## Tests

```bash
cd backend && ../.venv/bin/pytest -q   # 125 tests: fills, FSM, stores, auth, concurrency, API, engine endpoints
(cd frontend && npm run build)     # strict TS (no unused code) + bundle; both run in CI
```
Engine-dependent tests skip automatically when `../SEPA-terminal` is absent (CI).

## Project layout

```
backend/app/
├── main.py           FastAPI app factory + routes (thin)
├── config.py         paths + env (loads backend/.env)
├── domain.py         Signal / Trade / TradeEvent + the trade state machine
├── auth.py           opt-in passphrase, signed cookie, login throttling
├── broker/           Broker ABC · PaperBroker (proven fill rules, thread-safe)
├── store/            Store ABC · csv_store (default) · sqlite_store
├── signals/          adapter.py (imports the SEPA engine) · mock.py
├── insights.py       stock detail, Trend Template checklist, holdings review, TTLC stats
├── backtester.py     imported SEPA backtester, saved runs
├── chartdata.py · sectors.py · watchlists.py · watchlist.py · ticket.py
├── profiles.py · settings.py · secrets.py · stockedge_admin.py · symbols.py
├── feed/dhan.py      stub — waits for a Dhan token
└── jobs/             scheduler (daily scans) · quote_poller (live fills) · auto_paper · notify
frontend/src/
├── api.ts            the only network layer (typed)
├── ui.tsx            shared table / stat / chip / state components
├── App.tsx           navigation shell (tabs + overlays + back gesture)
├── components/StockChart.tsx
└── pages/            Today · Markets · Portfolio · Research · Search · Stock · Trade ·
                      Settings · Data · About · Login · StockEdgeDialog
```

## Optional settings

Set these as environment variables or in `backend/.env` (git-ignored, never committed):

| Variable | Default | What it does |
|---|---|---|
| `SEPA_ROOT` | `../SEPA-terminal` | Where the signal engine + price store live |
| `TRADEUP_STORE` | `csv` | `sqlite` swaps journal storage (imports the CSV journal once) |
| `TRADEUP_PASSPHRASE` | *(unset)* | Turns on login (required before any non-localhost use) |
| `TRADEUP_SCAN_TIMES` | `17:30` | Daily update + scan time(s), e.g. `09:15,17:30` |
| `TRADEUP_QUOTE_INTERVAL` | `15` | Seconds between quote polls for paper fills |
| `TRADEUP_TELEGRAM_TOKEN` + `_CHAT_ID` | *(unset)* | Telegram alerts: fills, stop-outs, auto orders, scan changes |
| `TRADEUP_PORT` | `8000` | Port for the start/stop scripts |

## Roadmap

1. ~~Web MVP, CSV journal, real SEPA signals, live paper fills, P&L~~ **done**
2. ~~SQLite option, opt-in auth, PWA, notifications, charts, backtest, search~~ **done**
3. ~~SEPA-terminal parity (everything that doesn't need Dhan), rule profiles, ⚡ auto paper~~ **done**
4. **Next:** Dhan WebSocket feed + live intraday scanner (needs your token), server deployment (see docs/DEPLOYMENT.md)
5. **Later:** multi-user (Postgres, per-user journals) after the method is validated by an experienced trader
6. **Gated:** real orders behind the `Broker` interface, only with explicit owner sign-off. Paper first, always.

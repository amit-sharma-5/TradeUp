# TradeUp — a clean, simple paper-trading terminal for Indian equities

Signal → decision → paper order → outcome → review. That's the whole product.

- **PRD:** [docs/PRD.md](docs/PRD.md) — scope, phases, open questions
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — decisions (D1–D6), layout, testing plan
- **Trading guide (plain English):** [docs/TRADING-GUIDE.md](docs/TRADING-GUIDE.md) — every concept explained for a new trader

## Quick start

Backend (Python 3.11+):

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Frontend (Node 18+), second terminal:

```bash
cd frontend
npm install && npm run dev     # → http://127.0.0.1:5173 (proxies /api to :8000)
```

Kill both later with `pkill -f "uvicorn app.main:app"; pkill -f vite`.

**Signals:** if the sibling repo `../SEPA-terminal` exists, the app uses its real
SEPA engine and price store (no first-time download — the store is already
populated). Otherwise it falls back to 3 mock signals. `GET /api/health` shows
which source is active. The first background scan starts when you open the
Candidates page; it can take a minute when the engine cache is cold.

**Tests / CI:** `cd backend && .venv/bin/pytest -q`; frontend build runs on
push via `.github/workflows/ci.yml`.

## Roadmap

1. **Phase 1 (now):** web MVP — Candidates · Ticket · Journal (event timeline), in-memory → CSV store, no auth, localhost.
2. **Phase 2:** SQLite (trades, trade_events, signals history), real signal source (SEPA engine as a library), auth design.
3. **Phase 3:** private hosting + HTTPS, PWA/mobile pass, notifications.
4. **Phase 4 (gated):** real orders behind `Broker` interface + explicit sign-off. Paper first, always.

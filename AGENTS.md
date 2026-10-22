# TradeUp — project context for AI sessions

Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/TRADING-GUIDE.md` for full detail. This file is the working summary.

## What this is

TradeUp: a personal paper-trading terminal for NSE equities. Core loop: **signal → decision → paper order → outcome → review**. Greenfield rebuild of the ideas proven in the sibling repo `../SEPA-terminal` (read its `ARCHITECTURE.md` / `HANDOVER.md` if engine questions come up).

## Current state (Phase 1, started 2026-10-22)

Working scaffold, verified end-to-end:

- `backend/` — FastAPI (`uvicorn app.main:app --reload --port 8000` from `backend/`). Mock signal source (3 fake signals), `POST /api/orders` creates a paper trade with an **event timeline**, `GET /api/journal` returns trades + events. All in-memory.
- `frontend/` — Vite + React + TypeScript (strict) + **MUI**, Groww-style green accent, mobile-first (bottom nav), 3 pages: Candidates (cards with plain-English "why") → Trade ticket → Journal with event timelines. `npm run dev` proxies `/api` → :8000.
- CI: none yet. Tests: none yet — this is the immediate priority.

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
2. Replace in-memory stores with `csv_store.py` implementing the `Store` interface (atomic writes: temp file + rename).
3. `signals/adapter.py`: import the SEPA engine as a library and expose `get_candidates() -> list[Signal]`. Decide with the owner how to point it at a price store (initially Yahoo-only download, no API key).
4. UI iteration on the three pages (owner is not a frontend expert — keep components simple, prefer MUI defaults).
5. Phase 2: SQLite swap, auth design, PWA/responsive pass.

## Conventions

- Python 3.11, pandas 2.x (not 3.x). Backend stdlib-style: small modules, docstrings explaining "why".
- Frontend: strict TypeScript, functional components, one component per screen in `src/pages/`, shared fetch logic only in `src/api.ts`, types only in `src/types.ts` (mirror of backend domain model).
- Commits: short imperative subject; body explains the why.
- UI language: plain English, every screen self-explanatory to a new trader (see docs/TRADING-GUIDE.md).

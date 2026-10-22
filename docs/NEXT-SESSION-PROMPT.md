# Kickoff prompt for the next session

Paste this as your first message when starting an opencode session in this repo.
After this one, sessions only need short prompts (e.g. "continue with backlog
item 2") because `AGENTS.md` carries the context automatically.

---

```text
This is the TradeUp repo (read AGENTS.md and docs/ first — PRD, ARCHITECTURE,
TRADING-GUIDE). It's a greenfield paper-trading terminal; a verified scaffold
exists: FastAPI backend with mock signals + event-sourced paper orders, and a
React+MUI frontend (Candidates / Trade / Journal).

Start executing the backlog in AGENTS.md, in order:

1. Write backend/tests with pytest: broker fill rules (buy-stop fill,
   chase-limit cancel, limit fill, stop-out), journal state machine (legal
   transitions only, exactly one TradeEvent per transition), and API contract
   tests via FastAPI TestClient. Add a GitHub Actions workflow that runs pytest
   and the frontend build on push.
2. Add store/csv_store.py implementing the Store interface (atomic
   write-temp-then-rename) and replace the in-memory stores.
3. Then stop and review with me before touching the signal source.

Constraints: paper only (no real-order code path), no auth in Phase 1,
trading rules come from ../SEPA-terminal/sepa as a library (don't port or
modify them), Python 3.11 + pandas 2.x. Explain trade-offs briefly as you go —
I'm new to both Python and trading.
```

---

**Why item 3 is a checkpoint:** wiring the real SEPA engine (`../SEPA-terminal/sepa`) is where the two repos connect and where design choices (which price store, how much of the screener to expose) need the owner's input. Don't let a session charge past it.

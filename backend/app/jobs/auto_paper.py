"""Auto paper trading (the owner's ⚡ Buy Now idea, proven in SEPA-terminal).

When enabled, every completed scan places paper orders for NEW Strong Buy / Buy
candidates: BUY_STOP at the pivot, sized by the engine's own plan (equity ×
risk% ÷ risk-per-share, position cap). Exits stay rule-driven — the stop-out
logic in PaperBroker is the strategy's sell side, so nothing else is needed.

Safety rails:
- paper only, and only when the trader turned auto_paper ON in settings;
- never duplicates: a symbol with a PLANNED/OPEN trade is skipped;
- the engine's plan must be clean (no rule warnings, qty > 0);
- every auto order is journaled with note "auto (⚡ Buy Now)" so review can
  separate machine trades from manual ones.
"""
from ..domain import Signal


def run_after_scan(candidates: list[Signal], broker, settings_get, plan_fn) -> list[str]:
    """Place auto paper orders for new candidates. Returns placed "SYM qty" strings."""
    s = settings_get()
    if not s.get("auto_paper"):
        return []
    active = broker.active_symbols()
    placed = []
    for sig in candidates:
        if sig.category.value not in ("Strong Buy", "Buy"):
            continue
        if sig.symbol in active:
            continue
        try:
            plan = plan_fn(sig.pivot, sig.pivot, sig.stop)
        except Exception:
            continue
        if plan.get("problems") or plan.get("qty", 0) <= 0:
            continue
        try:
            t = broker.place(sig.symbol, "BUY_STOP", plan["qty"], sig.pivot,
                             sig.stop, pivot=sig.pivot)
        except ValueError:
            continue
        broker.set_note(t.id, "auto (⚡ Buy Now) — placed by the screener")
        placed.append(f"{sig.symbol} ×{plan['qty']}")
    return placed
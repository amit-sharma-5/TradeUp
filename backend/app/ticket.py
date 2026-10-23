"""Ticket sizing: the engine's validated position-sizing rule behind an endpoint.

Calls sepa.trading.plan() — shares = equity × risk% ÷ (entry − stop), capped at
max_pos_pct of equity, with the wiki hard limits (stop ≤ 10 %, risk ≤ 2.5 %) and
chase-limit warnings — with TradeUp's own settings plugged in. Sizing is rule
logic, so it is imported, never rewritten (AGENTS non-negotiable 3).
"""
import sys

from . import config, settings
from .chartdata import build_chart


def plan_for(symbol: str, entry: float | None = None, stop: float | None = None,
             equity: float | None = None) -> dict:
    """The full trade plan (entry/stop/qty/R multiples/problems) for one symbol."""
    c = build_chart(symbol)
    pivot = c["pivot"] or (c["candles"][-1]["close"] if c["candles"] else 0)
    if not pivot:
        raise FileNotFoundError(symbol)

    if str(config.SEPA_ROOT) not in sys.path:
        sys.path.insert(0, str(config.SEPA_ROOT))
    from sepa import trading

    # TradeUp's own settings win; the engine's other defaults stay as tuned.
    s = {**trading.DEFAULTS, "equity": equity or settings.get()["equity"]}
    plan = trading.plan(pivot, entry=entry, stop=stop, s=s)
    plan["name"] = c["symbol"]
    plan["ltp"] = c["candles"][-1]["close"] if c["candles"] else None
    return plan
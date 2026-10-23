"""PaperBroker — the only broker in Phase 1 (no real-order code path exists).

Fill rules are ported verbatim from the proven engine (../SEPA-terminal/sepa/broker.py,
PaperBroker.on_quotes):
  * BUY_STOP planned -> fills at the LTP when LTP >= trigger; if the first tick
    at/above the trigger is already beyond pivot + chase %, cancel with reason
    ("ran above chase limit - no fill").
  * LIMIT planned    -> fills at the LTP when LTP <= limit.
  * open             -> closes at the LTP when LTP <= stop.

Every action appends exactly one TradeEvent via the domain state machine.
"""
from ..domain import Trade, TradeEvent, TradeStatus, log_event, transition
from .base import Broker

CHASE_PCT = 2.0  # same default as sepa/params.py (F2F 2022: buy within 1-2% of pivot)


def _now() -> str:
    import time
    return time.strftime("%Y-%m-%d %H:%M:%S")


class PaperBroker(Broker):
    name, live = "paper", False

    def __init__(self, store):
        # The broker owns the trade lifecycle; the store persists it.
        self._store = store

    # ── order entry ────────────────────────────────────────────────────────
    def place(self, symbol: str, kind: str, qty: int, limit_price: float,
              stop: float, pivot: float | None = None) -> Trade:
        if kind not in ("BUY_STOP", "LIMIT"):
            raise ValueError(f"unknown order kind {kind}")
        if qty <= 0 or limit_price <= 0 or stop <= 0 or stop >= limit_price:
            raise ValueError("qty/limit/stop invalid (stop must be below entry)")
        trade = Trade(id=self._store.next_trade_id(), symbol=symbol,
                      status=TradeStatus.PLANNED, qty=qty, order_kind=kind,
                      trigger=limit_price, stop=stop, pivot=pivot)
        trade.events.append(TradeEvent(
            ts=_now(), event="order_placed", price=limit_price, qty=qty,
            reason=f"{kind} @ {limit_price}, stop {stop}"))
        self._store.save_trade(trade)
        return trade

    def cancel(self, trade_id: str, reason: str = "cancelled by you") -> Trade:
        trade = self._need(trade_id, TradeStatus.PLANNED)
        transition(trade, TradeStatus.CANCELLED, "cancelled",
                   reason=reason or "cancelled by you", ts=_now())
        self._store.save_trade(trade)
        return trade

    def modify_stop(self, trade_id: str, stop: float) -> Trade:
        """Same rule as the proven engine (sepa/broker.py PaperBroker.modify_stop):
        stop must be > 0 and, while planned, below the trigger. While open, below
        the actual entry. Every move is journaled."""
        trade = self._need(trade_id, TradeStatus.PLANNED, TradeStatus.OPEN)
        ref = trade.entry_price if (trade.status is TradeStatus.OPEN and trade.entry_price) \
            else trade.trigger
        if stop <= 0 or (trade.status is TradeStatus.PLANNED and ref and stop >= ref):
            raise ValueError("stop must be below the entry")
        old, trade.stop = trade.stop, round(float(stop), 2)
        log_event(trade, "stop_moved", price=trade.stop, qty=trade.qty,
                  reason=f"stop {old} -> {trade.stop}", ts=_now())
        self._store.save_trade(trade)
        return trade

    def exit(self, trade_id: str, price: float, reason: str = "sold (paper)") -> Trade:
        """Manual exit: the trader books the price they would have sold at."""
        trade = self._need(trade_id, TradeStatus.OPEN)
        if price is None or price != price or price <= 0:
            raise ValueError("exit price must be a positive number")
        trade.exit_price = round(float(price), 2)
        trade.exit_reason = reason or "sold (paper)"
        transition(trade, TradeStatus.CLOSED, "exited",
                   price=trade.exit_price, qty=trade.qty, reason=trade.exit_reason, ts=_now())
        self._store.save_trade(trade)
        return trade

    def set_note(self, trade_id: str, note: str) -> Trade:
        """Notes & lessons — part of the review loop, no status change."""
        trade = self._store.get_trade(trade_id)
        if trade is None:
            raise KeyError(f"trade {trade_id} not found")
        trade.note = (note or "").strip()
        self._store.save_trade(trade)
        return trade

    # ── fill rules (verbatim port of sepa PaperBroker.on_quotes) ───────────
    def on_quotes(self, ltp: dict[str, float]) -> list[dict]:
        events = []
        for trade in self._store.active_trades():
            px = ltp.get(trade.symbol)
            if px is None or px != px or px <= 0:   # px != px catches NaN
                continue
            if trade.status is TradeStatus.PLANNED:
                events += self._fill_planned(trade, px)
            elif trade.status is TradeStatus.OPEN:
                events += self._maybe_stop_out(trade, px)
        return events

    def _fill_planned(self, trade: Trade, px: float) -> list[dict]:
        kind = trade.order_kind
        trigger = trade.trigger  # the order trigger/limit price
        if kind == "LIMIT" and px <= trigger:
            return self._fill(trade, px, kind)
        if kind != "LIMIT" and px >= trigger:
            base = trade.pivot if (trade.pivot is not None and trade.pivot > 0) else trigger
            lim = base * (1 + CHASE_PCT / 100)
            if px > max(lim, trigger) + 1e-9:
                transition(trade, TradeStatus.CANCELLED, "cancelled",
                           price=px,
                           reason=f"ran above chase limit - no fill "
                                  f"(LTP {px:,.2f} above chase limit {lim:,.2f})",
                           ts=_now())
                self._store.save_trade(trade)
                return [{"id": trade.id, "symbol": trade.symbol, "event": "cancelled",
                         "price": px, "why": f"LTP {px:,.2f} above chase limit {lim:,.2f}"}]
            return self._fill(trade, px, kind)
        return []

    def _fill(self, trade: Trade, px: float, kind: str) -> list[dict]:
        trade.entry_price = px
        transition(trade, TradeStatus.OPEN, "filled",
                   price=px, qty=trade.qty, reason=f"{kind} fill", ts=_now())
        self._store.save_trade(trade)
        return [{"id": trade.id, "symbol": trade.symbol, "event": "filled",
                 "price": px, "kind": kind}]

    def _maybe_stop_out(self, trade: Trade, px: float) -> list[dict]:
        if trade.stop is None or px > trade.stop:
            return []
        trade.exit_price = px
        transition(trade, TradeStatus.CLOSED, "stopped_out",
                   price=px, qty=trade.qty, reason="stop", ts=_now())
        self._store.save_trade(trade)
        return [{"id": trade.id, "symbol": trade.symbol, "event": "stopped_out",
                 "price": px}]

    # ── helpers ────────────────────────────────────────────────────────────
    def _need(self, trade_id: str, *states: TradeStatus) -> Trade:
        trade = self._store.get_trade(trade_id)
        if trade is None:
            raise KeyError(f"trade {trade_id} not found")
        if trade.status not in states:
            raise ValueError(f"trade is {trade.status.value}")
        return trade
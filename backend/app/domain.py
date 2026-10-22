"""Domain model + the journal state machine (ARCHITECTURE.md D2).

The state machine is the single place that knows which trade statuses may
follow which, and it guarantees the core promise: every legal transition
appends exactly one TradeEvent. The broker calls transition(); nothing else
mutates a trade's status or event list.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Category(str, Enum):
    STRONG_BUY = "Strong Buy"
    BUY = "Buy"
    WATCH = "Watch"


class TradeStatus(str, Enum):
    PLANNED = "PLANNED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


# Legal transitions only. Anything else raises IllegalTransition.
TRANSITIONS: dict[TradeStatus, set[TradeStatus]] = {
    TradeStatus.PLANNED: {TradeStatus.OPEN, TradeStatus.CANCELLED},
    TradeStatus.OPEN: {TradeStatus.CLOSED},
    TradeStatus.CLOSED: set(),
    TradeStatus.CANCELLED: set(),
}

# Default event name per transition. OPEN -> CLOSED has two possible events
# (stopped_out / exited), so the caller must say which one it is.
EVENT_FOR_TRANSITION = {
    (TradeStatus.PLANNED, TradeStatus.OPEN): "filled",
    (TradeStatus.PLANNED, TradeStatus.CANCELLED): "cancelled",
}


class IllegalTransition(ValueError):
    """Raised when a status change is not allowed by TRANSITIONS."""


@dataclass
class Signal:
    symbol: str
    name: str
    category: Category
    ltp: float
    change_pct: float
    pivot: float
    stop: float
    why: str


@dataclass
class TradeEvent:
    ts: str
    event: str          # order_placed | filled | cancelled | stopped_out | exited
    price: Optional[float]
    qty: Optional[int]
    reason: str = ""


@dataclass
class Trade:
    id: str
    symbol: str
    status: TradeStatus = TradeStatus.PLANNED
    qty: int = 0
    order_kind: str = "BUY_STOP"        # BUY_STOP | LIMIT
    trigger: Optional[float] = None     # order trigger/limit price while PLANNED
    entry_price: Optional[float] = None  # actual fill price once OPEN
    stop: Optional[float] = None
    pivot: Optional[float] = None       # needed by the chase-limit rule
    exit_price: Optional[float] = None
    exit_reason: str = ""
    events: list[TradeEvent] = field(default_factory=list)

    def to_dict(self) -> dict:
        """API shape — status/event enums as plain strings, exactly one event row each."""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "status": self.status.value,
            "qty": self.qty,
            "order_kind": self.order_kind,
            "trigger": self.trigger,
            "entry_price": self.entry_price,
            "stop": self.stop,
            "pivot": self.pivot,
            "exit_price": self.exit_price,
            "exit_reason": self.exit_reason,
            "events": [
                {"ts": e.ts, "event": e.event, "price": e.price,
                 "qty": e.qty, "reason": e.reason}
                for e in self.events
            ],
        }


def transition(trade: Trade, new_status: TradeStatus, event: str, *,
               price: Optional[float] = None, qty: Optional[int] = None,
               reason: str = "", ts: str) -> TradeEvent:
    """Move a trade to new_status and append exactly one TradeEvent.

    Raises IllegalTransition if the move is not legal, or ValueError if the
    caller did not name the event. Never edits existing events.
    """
    if new_status not in TRANSITIONS[trade.status]:
        raise IllegalTransition(
            f"{trade.status.value} -> {new_status.value} is not a legal transition")
    if not event:
        raise ValueError("every transition must name its event")
    ev = TradeEvent(ts=ts, event=event, price=price, qty=qty, reason=reason)
    trade.status = new_status
    trade.events.append(ev)
    return ev
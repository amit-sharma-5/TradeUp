"""Broker seam (ARCHITECTURE.md D4): only PaperBroker exists.

A LiveBroker would have to implement the same methods — and be explicitly
reviewed and gated — before any real order code path can exist.
"""
from abc import ABC, abstractmethod

from ..domain import Trade


class Broker(ABC):
    @abstractmethod
    def place(self, symbol: str, kind: str, qty: int, limit_price: float,
              stop: float, pivot: float | None = None) -> Trade:
        """Create a PLANNED trade with an order_placed event."""

    @abstractmethod
    def cancel(self, trade_id: str, reason: str = "") -> Trade:
        """PLANNED -> CANCELLED with a cancelled event."""

    @abstractmethod
    def modify_stop(self, trade_id: str, stop: float) -> Trade:
        """Move the stop of a PLANNED/OPEN trade; appends a stop_moved event."""

    @abstractmethod
    def exit(self, trade_id: str, price: float, reason: str = "") -> Trade:
        """OPEN -> CLOSED at a manual price (the trader books the exit)."""

    @abstractmethod
    def on_quotes(self, ltp: dict[str, float]) -> list[dict]:
        """Feed last-traded prices; apply fill rules; return event dicts."""
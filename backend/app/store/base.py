"""Storage seam (ARCHITECTURE.md D3): CSV now, SQLite later — same interface.

The interface is deliberately small: the journal is the only mutable state in
Phase 1 (signals come from a source, prices from a feed).
"""
from abc import ABC, abstractmethod

from ..domain import Trade, TradeStatus


class Store(ABC):
    @abstractmethod
    def next_trade_id(self) -> str:
        """Sequential id like T0001."""

    @abstractmethod
    def get_trade(self, trade_id: str) -> Trade | None:
        ...

    @abstractmethod
    def save_trade(self, trade: Trade) -> None:
        """Create or replace the trade (the event list travels with it)."""

    @abstractmethod
    def list_trades(self) -> list[Trade]:
        ...

    def active_trades(self) -> list[Trade]:
        """Trades the broker still acts on: PLANNED or OPEN."""
        return [t for t in self.list_trades()
                if t.status in (TradeStatus.PLANNED, TradeStatus.OPEN)]
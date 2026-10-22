"""In-memory store — Phase 1 scaffold. Replaced by csv_store.py (backlog item 2)
which implements the same interface with atomic writes."""
import itertools

from ..domain import Trade
from .base import Store


class InMemoryStore(Store):
    def __init__(self):
        self._trades: dict[str, Trade] = {}
        self._ids = itertools.count(1)

    def next_trade_id(self) -> str:
        return f"T{next(self._ids):04d}"

    def get_trade(self, trade_id: str) -> Trade | None:
        return self._trades.get(trade_id)

    def save_trade(self, trade: Trade) -> None:
        self._trades[trade.id] = trade

    def list_trades(self) -> list[Trade]:
        return list(self._trades.values())
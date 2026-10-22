"""Seeded E2E (ARCHITECTURE.md §6.5): signal -> order -> fill -> stop-out ->
journal shows the full story. Runs on the real CsvStore, no network."""
from app.broker.paper import PaperBroker
from app.domain import TradeStatus
from app.signals.mock import MockSignalSource
from app.store.csv_store import CsvStore


def test_full_trade_story_ends_in_the_journal(tmp_path):
    sig = next(s for s in MockSignalSource().get_candidates() if s.symbol == "PERSISTENT")
    store = CsvStore(tmp_path / "journal")
    broker = PaperBroker(store)
    quotes = iter([
        {"PERSISTENT": sig.pivot - 5},        # below trigger: no fill yet
        {"PERSISTENT": sig.pivot},            # at trigger: fills
        {"PERSISTENT": sig.pivot + 30},       # runs in our favour
        {"PERSISTENT": sig.stop - 1},         # then falls through the stop
    ])
    broker.on_quotes(next(quotes))            # (poller would do this every 15 s)
    trade = broker.place(sig.symbol, "BUY_STOP", 10, sig.pivot, sig.stop, pivot=sig.pivot)
    for _ in range(3):
        broker.on_quotes(next(quotes))

    t = store.get_trade(trade.id)
    assert t.status is TradeStatus.CLOSED
    assert [e.event for e in t.events] == ["order_placed", "filled", "stopped_out"]
    assert t.entry_price == sig.pivot and t.exit_price == sig.stop - 1
    pnl = (t.exit_price - t.entry_price) * t.qty
    assert pnl == round((sig.stop - 1 - sig.pivot) * 10, 2)   # a stopped-out 10-share trade loses ~7 % + a rupee

    # The story survives a restart: everything comes back from the CSV journal.
    reopened = CsvStore(tmp_path / "journal").get_trade(trade.id)
    assert [e.event for e in reopened.events] == ["order_placed", "filled", "stopped_out"]
    assert reopened.entry_price == t.entry_price and reopened.exit_price == t.exit_price
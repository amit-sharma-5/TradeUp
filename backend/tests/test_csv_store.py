"""CsvStore: persistence, event append-only semantics, atomic snapshot writes."""
import csv

import pytest

from app.domain import Trade, TradeEvent, TradeStatus, transition
from app.store.csv_store import CsvStore


@pytest.fixture
def store(tmp_path):
    return CsvStore(tmp_path / "journal")


def _planned(store, symbol="PERSISTENT", kind="LIMIT", qty=10,
             trigger=5700.0, stop=5210.0, pivot=5605.0):
    t = Trade(
        id=store.next_trade_id(), symbol=symbol, status=TradeStatus.PLANNED,
        qty=qty, order_kind=kind, trigger=trigger, stop=stop, pivot=pivot,
        events=[TradeEvent(ts="2026-10-22 10:00:00", event="order_placed",
                           price=trigger, qty=qty, reason=f"{kind} @ {trigger}, stop {stop}")])
    store.save_trade(t)
    return t


def _rows(path, tmp_path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def test_save_then_reload_round_trips(tmp_path):
    _planned(CsvStore(tmp_path / "j"))
    reopened = CsvStore(tmp_path / "j")
    (t,) = reopened.list_trades()
    assert (t.id, t.symbol, t.status, t.qty, t.order_kind) == ("T0001", "PERSISTENT",
                                                              TradeStatus.PLANNED, 10, "LIMIT")
    assert (t.trigger, t.stop, t.pivot) == (5700.0, 5210.0, 5605.0)
    assert [e.event for e in t.events] == ["order_placed"]


def test_next_trade_id_increments_across_restarts(tmp_path):
    s = CsvStore(tmp_path / "j")
    _planned(s)
    assert CsvStore(tmp_path / "j").next_trade_id() == "T0002"


def test_save_trade_appends_each_new_event_exactly_once(tmp_path):
    s = CsvStore(tmp_path / "j")
    t = _planned(s)
    s.save_trade(t)                                   # re-save with no new events
    assert len(_rows(tmp_path / "j" / "events.csv", tmp_path)) == 1
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="2026-10-22 10:01:00")
    s.save_trade(t)
    s.save_trade(t)                                   # duplicate save must not duplicate the row
    rows = _rows(tmp_path / "j" / "events.csv", tmp_path)
    assert [r["event"] for r in rows] == ["order_placed", "filled"]
    reopened = CsvStore(tmp_path / "j")
    assert [e.event for e in reopened.get_trade("T0001").events] == ["order_placed", "filled"]


def test_snapshot_reflects_transitions(tmp_path):
    s = CsvStore(tmp_path / "j")
    t = _planned(s)
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0                            # the broker sets this on fill
    s.save_trade(t)
    (row,) = _rows(tmp_path / "j" / "trades.csv", tmp_path)
    assert row["status"] == "OPEN"
    assert float(row["entry_price"]) == 5605.0
    assert row["trigger"] == "5700.0"


def test_full_lifecycle_survives_restart(tmp_path):
    s = CsvStore(tmp_path / "j")
    t = _planned(s)
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0
    s.save_trade(t)
    t.exit_price = 5210.0
    transition(t, TradeStatus.CLOSED, "stopped_out", price=5210.0, qty=10, ts="y")
    s.save_trade(t)

    reopened_store = CsvStore(tmp_path / "j")
    reopened = reopened_store.get_trade("T0001")
    assert reopened.status is TradeStatus.CLOSED
    assert reopened.exit_price == 5210.0
    assert [e.event for e in reopened.events] == ["order_placed", "filled", "stopped_out"]
    assert reopened_store.active_trades() == []       # closed trades are not active


def test_atomic_snapshot_leaves_no_temp_file(tmp_path):
    s = CsvStore(tmp_path / "j")
    _planned(s)
    assert not (tmp_path / "j" / "trades.csv.tmp").exists()


def test_orphan_event_is_tolerated_on_load(tmp_path):
    j = tmp_path / "j"
    j.mkdir()
    (j / "events.csv").write_text(
        "trade_id,ts,event,price,qty,reason\nT9999,2026-01-01,filled,1,1,orphan\n")
    store = CsvStore(j)
    assert store.list_trades() == []                  # skipped, no crash
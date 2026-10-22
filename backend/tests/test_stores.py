"""Store tests, run against every implementation (CsvStore and SqliteStore):
persistence, event append-only semantics. Implementation-specific behaviour
(atomic snapshot temp files, orphan events) is tested at the bottom."""
import csv

import pytest

from app.domain import Trade, TradeEvent, TradeStatus, transition
from app.store.csv_store import CsvStore
from app.store.sqlite_store import SqliteStore


@pytest.fixture(params=[CsvStore, SqliteStore], ids=["csv", "sqlite"])
def store(request, tmp_path):
    return request.param(tmp_path / "journal")


def _planned(store, symbol="PERSISTENT", kind="LIMIT", qty=10,
             trigger=5700.0, stop=5210.0, pivot=5605.0):
    t = Trade(
        id=store.next_trade_id(), symbol=symbol, status=TradeStatus.PLANNED,
        qty=qty, order_kind=kind, trigger=trigger, stop=stop, pivot=pivot,
        events=[TradeEvent(ts="2026-10-22 10:00:00", event="order_placed",
                           price=trigger, qty=qty, reason=f"{kind} @ {trigger}, stop {stop}")])
    store.save_trade(t)
    return t


def _reopen(store):
    """A fresh instance over the same storage, like an app restart."""
    path = store._dir if hasattr(store, "_dir") else store._path
    return type(store)(path)


def test_save_then_reload_round_trips(store):
    _planned(store)
    (t,) = _reopen(store).list_trades()
    assert (t.id, t.symbol, t.status, t.qty, t.order_kind) == ("T0001", "PERSISTENT",
                                                              TradeStatus.PLANNED, 10, "LIMIT")
    assert (t.trigger, t.stop, t.pivot) == (5700.0, 5210.0, 5605.0)
    assert [e.event for e in t.events] == ["order_placed"]


def test_next_trade_id_increments_across_restarts(store):
    _planned(store)
    assert _reopen(store).next_trade_id() == "T0002"


def test_save_trade_appends_each_new_event_exactly_once(store):
    t = _planned(store)
    store.save_trade(t)                               # re-save with no new events
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="2026-10-22 10:01:00")
    t.entry_price = 5605.0
    store.save_trade(t)
    store.save_trade(t)                               # duplicate save must not duplicate the row
    reopened = _reopen(store)
    assert [e.event for e in reopened.get_trade("T0001").events] == ["order_placed", "filled"]


def test_snapshot_reflects_transitions(store):
    t = _planned(store)
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0                            # the broker sets this on fill
    store.save_trade(t)
    reopened = _reopen(store).get_trade("T0001")
    assert reopened.status is TradeStatus.OPEN
    assert reopened.entry_price == 5605.0
    assert reopened.trigger == 5700.0


def test_full_lifecycle_survives_restart(store):
    s = store
    t = _planned(s)
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0
    s.save_trade(t)
    t.exit_price = 5210.0
    transition(t, TradeStatus.CLOSED, "stopped_out", price=5210.0, qty=10, ts="y")
    s.save_trade(t)

    reopened_store = _reopen(s)
    reopened = reopened_store.get_trade("T0001")
    assert reopened.status is TradeStatus.CLOSED
    assert reopened.exit_price == 5210.0
    assert [e.event for e in reopened.events] == ["order_placed", "filled", "stopped_out"]
    assert reopened_store.active_trades() == []       # closed trades are not active


# ── CSV-only behaviour ─────────────────────────────────────────────────────
def test_csv_atomic_snapshot_leaves_no_temp_file(tmp_path):
    s = CsvStore(tmp_path / "j")
    _planned(s)
    assert not (tmp_path / "j" / "trades.csv.tmp").exists()


def test_csv_orphan_event_is_tolerated_on_load(tmp_path):
    j = tmp_path / "j"
    j.mkdir()
    (j / "events.csv").write_text(
        "trade_id,ts,event,price,qty,reason\nT9999,2026-01-01,filled,1,1,orphan\n")
    assert CsvStore(j).list_trades() == []            # skipped, no crash


def test_csv_events_file_is_append_only(tmp_path):
    s = CsvStore(tmp_path / "j")
    t = _planned(s)
    before = (tmp_path / "j" / "events.csv").read_text()
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0
    s.save_trade(t)
    after = (tmp_path / "j" / "events.csv").read_text()
    assert after.startswith(before)                   # new rows appended, old bytes untouched
    rows = list(csv.DictReader(after.splitlines()))
    assert [r["event"] for r in rows] == ["order_placed", "filled"]

def test_sqlite_imports_from_csv_journal_once(tmp_path):
    csv_dir = tmp_path / "journal"
    s = CsvStore(csv_dir)
    t = _planned(s)
    transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="x")
    t.entry_price = 5605.0
    s.save_trade(t)

    db = SqliteStore(tmp_path / "journal.db")
    assert db.import_from_csv(csv_dir) == 2                  # 2 events
    imported = db.get_trade("T0001")
    assert imported.status is TradeStatus.OPEN
    assert imported.entry_price == 5605.0
    assert [e.event for e in imported.events] == ["order_placed", "filled"]

    # A second import into a non-empty database must do nothing (no duplicates).
    assert db.import_from_csv(csv_dir) == 0
    assert len(db.get_trade("T0001").events) == 2

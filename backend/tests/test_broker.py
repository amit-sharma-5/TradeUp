"""Broker fill rules — the money paths (ARCHITECTURE.md §6.1).

Rules ported verbatim from ../SEPA-terminal/sepa/broker.py PaperBroker.on_quotes;
these tests pin them so any future change is deliberate.
"""
import pytest

from app.domain import TradeStatus


def test_buy_stop_fills_at_ltp_when_trigger_reached(broker, store, persistent_sig):
    trigger = persistent_sig.pivot  # 5605.0
    t = broker.place("PERSISTENT", "BUY_STOP", qty=10, limit_price=trigger,
                     stop=persistent_sig.stop, pivot=persistent_sig.pivot)
    events = broker.on_quotes({"PERSISTENT": trigger + 0.5})
    assert [e["event"] for e in events] == ["filled"]
    trade = store.get_trade(t.id)
    assert trade.status is TradeStatus.OPEN
    assert trade.entry_price == trigger + 0.5
    assert trade.events[-1].event == "filled"


def test_buy_stop_no_fill_below_trigger(broker, persistent_sig):
    broker.place("PERSISTENT", "BUY_STOP", 10, persistent_sig.pivot,
                 persistent_sig.stop, pivot=persistent_sig.pivot)
    assert broker.on_quotes({"PERSISTENT": persistent_sig.pivot - 1}) == []


def test_buy_stop_cancels_beyond_chase_limit(broker, store, persistent_sig):
    """First tick at/above the trigger is already past pivot + chase% → cancel."""
    trigger = persistent_sig.pivot
    chase_limit = trigger * (1 + 2.0 / 100)
    t = broker.place("PERSISTENT", "BUY_STOP", 10, trigger,
                     persistent_sig.stop, pivot=trigger)
    broker.on_quotes({"PERSISTENT": chase_limit + 1})  # gaps straight past the chase limit
    trade = store.get_trade(t.id)
    assert trade.status is TradeStatus.CANCELLED
    assert "chase limit" in trade.events[-1].reason
    assert trade.events[-1].event == "cancelled"


def test_buy_stop_fills_within_chase_limit(broker, store, persistent_sig):
    trigger = persistent_sig.pivot
    within = trigger * (1 + 2.0 / 100) - 0.01
    t = broker.place("PERSISTENT", "BUY_STOP", 10, trigger,
                     persistent_sig.stop, pivot=trigger)
    broker.on_quotes({"PERSISTENT": within})
    assert store.get_trade(t.id).status is TradeStatus.OPEN


def test_buy_stop_cancellation_is_terminal(broker, store, persistent_sig):
    """A cancelled order must not come back to life on later quotes."""
    t = broker.place("PERSISTENT", "BUY_STOP", 10, persistent_sig.pivot,
                     persistent_sig.stop, pivot=persistent_sig.pivot)
    broker.on_quotes({"PERSISTENT": persistent_sig.pivot * 1.10})   # cancel
    broker.on_quotes({"PERSISTENT": persistent_sig.pivot})          # back at trigger
    trade = store.get_trade(t.id)
    assert trade.status is TradeStatus.CANCELLED
    assert len(trade.events) == 2  # order_placed + cancelled, nothing more


def test_limit_fills_when_ltp_at_or_below_limit(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    assert broker.on_quotes({"PERSISTENT": 5700.01}) == []      # above limit: no fill
    broker.on_quotes({"PERSISTENT": 5695.0})                    # at/below: fill
    trade = store.get_trade(t.id)
    assert trade.status is TradeStatus.OPEN
    assert trade.entry_price == 5695.0


def test_stop_out_closes_open_trade(broker, store, persistent_sig):
    stop = persistent_sig.stop  # 5210.0
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, stop)
    broker.on_quotes({"PERSISTENT": 5600.0})   # fill
    broker.on_quotes({"PERSISTENT": stop + 0.01})  # just above stop: still open
    assert store.get_trade(t.id).status is TradeStatus.OPEN
    broker.on_quotes({"PERSISTENT": stop})     # at stop: out
    trade = store.get_trade(t.id)
    assert trade.status is TradeStatus.CLOSED
    assert trade.exit_price == stop
    assert trade.events[-1].event == "stopped_out"


def test_each_fill_rule_appends_exactly_one_event(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    broker.on_quotes({"PERSISTENT": 5600.0})   # filled
    broker.on_quotes({"PERSISTENT": 5200.0})   # stopped out
    trade = store.get_trade(t.id)
    assert [e.event for e in trade.events] == ["order_placed", "filled", "stopped_out"]


def test_quotes_for_unknown_symbols_are_ignored(broker, persistent_sig):
    broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    assert broker.on_quotes({"INFY": 1500.0}) == []


def test_place_rejects_invalid_orders(broker, persistent_sig):
    with pytest.raises(ValueError):
        broker.place("PERSISTENT", "MARKET", 10, 5700.0, 5200.0)   # unknown kind
    with pytest.raises(ValueError):
        broker.place("PERSISTENT", "LIMIT", 0, 5700.0, 5200.0)     # qty <= 0
    with pytest.raises(ValueError):
        broker.place("PERSISTENT", "LIMIT", 10, 5700.0, 5800.0)    # stop above entry

def test_modify_stop_planned_and_open(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    moved = broker.modify_stop(t.id, 5500.0)                    # planned: below trigger
    assert moved.stop == 5500.0
    assert moved.events[-1].event == "stop_moved"
    broker.on_quotes({"PERSISTENT": 5600.0})                    # fill
    moved2 = broker.modify_stop(t.id, 5605.0)                   # open: below entry
    assert moved2.stop == 5605.0
    assert [e.event for e in store.get_trade(t.id).events] == \
        ["order_placed", "stop_moved", "filled", "stop_moved"]


def test_modify_stop_validations(broker, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    with pytest.raises(ValueError):
        broker.modify_stop(t.id, 5800.0)                        # planned: >= trigger
    with pytest.raises(ValueError):
        broker.modify_stop(t.id, 0)


def test_manual_exit_closes_trade_with_exited_event(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    broker.on_quotes({"PERSISTENT": 5600.0})
    out = broker.exit(t.id, 5900.0, "target hit")
    assert out.status is TradeStatus.CLOSED
    assert out.exit_price == 5900.0 and out.exit_reason == "target hit"
    assert store.get_trade(t.id).events[-1].event == "exited"


def test_exit_rejected_when_not_open(broker, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    with pytest.raises(ValueError):
        broker.exit(t.id, 5900.0)                               # still PLANNED


def test_set_note_on_any_trade(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    assert broker.set_note(t.id, "followed the system, will do better").note.startswith("followed")

"""Journal state machine (ARCHITECTURE.md D2 + §6.2):
legal transitions only, and every transition appends exactly one TradeEvent."""
import pytest

from app.domain import (EVENT_FOR_TRANSITION, TRANSITIONS, IllegalTransition,
                        Trade, TradeStatus, transition)


def _trade() -> Trade:
    return Trade(id="T0001", symbol="PERSISTENT", qty=10, stop=5200.0)


def test_every_status_has_a_transition_map_entry():
    for status in TradeStatus:
        assert status in TRANSITIONS


def test_legal_planned_transitions():
    assert TRANSITIONS[TradeStatus.PLANNED] == {TradeStatus.OPEN, TradeStatus.CANCELLED}


def test_planned_to_open_is_legal_and_appends_exactly_one_event():
    t = _trade()
    ev = transition(t, TradeStatus.OPEN, "filled", price=5605.0, qty=10, ts="2026-10-22 10:00:00")
    assert t.status is TradeStatus.OPEN
    assert t.events == [ev]                      # exactly one event, nothing else
    assert ev.event == "filled"
    assert (ev.price, ev.qty) == (5605.0, 10)


def test_planned_to_cancelled_is_legal():
    t = _trade()
    transition(t, TradeStatus.CANCELLED, "cancelled", ts="2026-10-22 10:00:00")
    assert t.status is TradeStatus.CANCELLED
    assert [e.event for e in t.events] == ["cancelled"]


def test_open_to_closed_is_legal():
    t = _trade()
    t.status = TradeStatus.OPEN
    transition(t, TradeStatus.CLOSED, "stopped_out", price=5199.0, ts="2026-10-22 10:00:00")
    assert t.status is TradeStatus.CLOSED
    assert [e.event for e in t.events] == ["stopped_out"]


@pytest.mark.parametrize("bad", [
    (TradeStatus.PLANNED, TradeStatus.CLOSED),    # cannot close what never opened
    (TradeStatus.OPEN, TradeStatus.PLANNED),      # no un-fill
    (TradeStatus.OPEN, TradeStatus.CANCELLED),    # cancel is for planned orders only
    (TradeStatus.CLOSED, TradeStatus.OPEN),       # closed is terminal
    (TradeStatus.CLOSED, TradeStatus.PLANNED),
    (TradeStatus.CANCELLED, TradeStatus.PLANNED), # cancelled is terminal
    (TradeStatus.CANCELLED, TradeStatus.OPEN),
])
def test_illegal_transitions_raise_and_change_nothing(bad):
    old, new = bad
    t = _trade()
    t.status = old
    with pytest.raises(IllegalTransition):
        transition(t, new, "filled", ts="2026-10-22 10:00:00")
    assert t.status is old
    assert t.events == []                         # no event was appended either


def test_terminal_statuses_allow_nothing():
    for status in (TradeStatus.CLOSED, TradeStatus.CANCELLED):
        assert TRANSITIONS[status] == set()


def test_transition_without_event_name_is_rejected():
    t = _trade()
    with pytest.raises(ValueError):
        transition(t, TradeStatus.OPEN, "", ts="2026-10-22 10:00:00")
    assert t.status is TradeStatus.PLANNED


def test_events_are_append_only():
    """Existing events are never edited; each transition adds exactly one."""
    t = _trade()
    before = list(t.events)
    for _ in range(3):
        t = _trade()
        transition(t, TradeStatus.OPEN, EVENT_FOR_TRANSITION[
            (TradeStatus.PLANNED, TradeStatus.OPEN)], ts="x")
        assert len(t.events) == 1
        assert before == []
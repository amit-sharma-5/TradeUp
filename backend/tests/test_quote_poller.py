"""QuotePoller: the missing link that turns quotes into paper fills."""
from app.domain import TradeStatus
from app.jobs.quote_poller import QuotePoller


def test_poll_with_no_active_trades_makes_no_calls(broker, store):
    calls = []
    poller = QuotePoller(broker, store, fetch=lambda syms: calls.append(syms) or {})
    assert poller.poll_once() == []
    assert calls == []                              # nothing active → zero network


def test_poll_fills_planned_buy_stop(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "BUY_STOP", 10, persistent_sig.pivot,
                     persistent_sig.stop, pivot=persistent_sig.pivot)
    poller = QuotePoller(broker, store, fetch=lambda syms: {"PERSISTENT": 5606.0})
    events = poller.poll_once()
    assert [e["event"] for e in events] == ["filled"]
    assert store.get_trade(t.id).status is TradeStatus.OPEN


def test_poll_stops_out_open_trade(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    poller = QuotePoller(broker, store,
                         fetch=lambda syms: {"PERSISTENT": 5600.0})   # fill
    poller.poll_once()
    poller._fetch = lambda syms: {"PERSISTENT": 5200.0}               # below stop
    events = poller.poll_once()
    assert [e["event"] for e in events] == ["stopped_out"]
    assert store.get_trade(t.id).status is TradeStatus.CLOSED


def test_fetch_failure_does_not_kill_the_poller(broker, store, persistent_sig):
    def boom(syms):
        raise RuntimeError("yahoo down")
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    poller = QuotePoller(broker, store, fetch=boom)
    try:
        poller.poll_once()
    except RuntimeError:
        pass                                          # poll_once raises; the loop catches it
    poller._fetch = lambda syms: {"PERSISTENT": 5600.0}
    poller.poll_once()                                # recovers on the next pass
    assert store.get_trade(t.id).status is TradeStatus.OPEN
    assert poller.status()["last_poll"]

def test_poller_updates_price_cache_and_calls_notifier(broker, store, persistent_sig):
    from app.jobs.quote_poller import PriceCache
    cache = PriceCache()
    notes = []
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    poller = QuotePoller(broker, store, fetch=lambda syms: {"PERSISTENT": 5600.0},
                         price_cache=cache, notify=notes.append)
    poller.poll_once()
    assert cache.get("PERSISTENT") == 5600.0
    assert len(notes) == 1 and "filled" in notes[0]


def test_broken_notifier_never_breaks_fills(broker, store, persistent_sig):
    t = broker.place("PERSISTENT", "LIMIT", 10, 5700.0, persistent_sig.stop)
    def boom(text): raise RuntimeError("webhook down")
    poller = QuotePoller(broker, store, fetch=lambda syms: {"PERSISTENT": 5600.0}, notify=boom)
    poller.poll_once()                                       # must not raise
    assert store.get_trade(t.id).status is TradeStatus.OPEN

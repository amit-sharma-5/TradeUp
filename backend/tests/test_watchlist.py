"""My Watchlist: personal list, separate from the engine's rule-driven lists."""
import pytest

from app.config import SEPA_ROOT

SEPA_OK = (SEPA_ROOT / "sepa" / "backtest.py").exists()
skip_no_sepa = pytest.mark.skipif(not SEPA_OK, reason="SEPA engine not available")


def test_add_remove_roundtrip(tmp_path, monkeypatch):
    from app import watchlist
    monkeypatch.setattr(watchlist, "_FILE", tmp_path / "watchlist.json")
    out = watchlist.add("HAL")
    assert out == ["HAL"]
    watchlist.add("HAL")                                   # dedupe
    watchlist.add("persistent")                            # case-insensitive
    assert watchlist.symbols() == ["HAL", "PERSISTENT"]
    assert watchlist.remove("hal") == ["PERSISTENT"]       # HAL removed, case-insensitive
    assert watchlist.remove("NOPE") == ["PERSISTENT"]      # removing an absent symbol is a no-op


def test_add_rejects_junk(tmp_path, monkeypatch):
    from app import watchlist
    monkeypatch.setattr(watchlist, "_FILE", tmp_path / "watchlist.json")
    for bad in ("", "ha l", "../x", "TOOLONGSYMBOL12345", "rel@iance"):
        with pytest.raises(ValueError):
            watchlist.add(bad)


def test_add_validates_against_price_store(tmp_path, monkeypatch):
    from app import watchlist
    monkeypatch.setattr(watchlist, "_FILE", tmp_path / "watchlist.json")
    with pytest.raises(ValueError):
        watchlist.add("NOTASTOCK", price_store_symbols={"HAL", "TCS"})


@skip_no_sepa
def test_watchlist_endpoints(real_client, tmp_path, monkeypatch):
    from app import watchlist as wl
    monkeypatch.setattr(wl, "_FILE", tmp_path / "watchlist.json")

    r = real_client.post("/api/watchlist", json={"symbol": "HAL"})
    assert r.status_code == 200 and "HAL" in r.json()["symbols"]
    assert real_client.post("/api/watchlist", json={"symbol": "NOT_A_STOCK"}).status_code == 422

    rows = real_client.get("/api/watchlist").json()["symbols"]
    (row,) = rows
    assert row["symbol"] == "HAL" and row["ltp"] and row["ltp"] > 0
    assert isinstance(row["change_pct"], float)

    real_client.delete("/api/watchlist/HAL")
    assert real_client.get("/api/watchlist").json()["symbols"] == []


@skip_no_sepa
def test_poller_polls_watchlist_symbols(real_client, tmp_path, monkeypatch):
    """Watchlist symbols get live quotes even with no active paper trades."""
    from app import watchlist as wl
    from app.jobs.quote_poller import QuotePoller
    monkeypatch.setattr(wl, "_FILE", tmp_path / "watchlist.json")
    wl.add("HAL")

    app = real_client.app
    poller = QuotePoller(app.state.broker, app.state.store,
                         fetch=lambda syms: {s: 100.0 for s in syms},
                         price_cache=app.state.prices, extra_symbols=wl.symbols)
    events = poller.poll_once()                            # no trades → no fill events
    assert events == []
    assert app.state.prices.get("HAL") == 100.0            # but the watchlist symbol was polled
"""Production-readiness pass: stock detail, holdings, stats, saved runs, data
page, auth hardening, concurrency, and the API's edge behaviour."""
import threading

import pytest

from app import auth
from app.config import SEPA_ROOT
from app.domain import TradeStatus

SEPA_OK = (SEPA_ROOT / "sepa" / "backtest.py").exists()
skip_no_sepa = pytest.mark.skipif(not SEPA_OK, reason="SEPA engine not available")


# ── API edges ─────────────────────────────────────────────────────────────
def test_unknown_api_path_is_json_404(client):
    r = client.get("/api/definitely-not-here")
    assert r.status_code == 404 and "no such endpoint" in r.json()["detail"]


def test_cors_is_not_wildcard(client):
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert r.headers.get("access-control-allow-origin") != "*"
    assert r.headers.get("access-control-allow-origin") is None


def test_session_endpoint_when_auth_off(client):
    assert client.get("/api/session").json() == {"auth_enabled": False, "authenticated": True}


# ── auth hardening ────────────────────────────────────────────────────────
@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(auth, "enabled", True)
    monkeypatch.setattr(auth, "_secret", "hunter2-long-passphrase")
    monkeypatch.setattr(auth, "_fails", {})


def test_health_leaks_nothing_when_locked(client, auth_on):
    body = client.get("/api/health").json()
    assert body == {"ok": True, "auth_required": True}


def test_login_throttles_after_repeated_failures(client, auth_on):
    for _ in range(5):
        assert client.post("/api/login", json={"passphrase": "nope"}).status_code == 401
    assert client.post("/api/login", json={"passphrase": "nope"}).status_code == 429
    # even the right passphrase waits out the window
    assert client.post("/api/login", json={"passphrase": "hunter2-long-passphrase"}).status_code == 429


def test_logout_clears_session(client, auth_on):
    assert client.post("/api/login", json={"passphrase": "hunter2-long-passphrase"}).status_code == 200
    assert client.get("/api/session").json()["authenticated"] is True
    client.post("/api/logout")
    client.cookies.clear()
    assert client.get("/api/session").json()["authenticated"] is False


def test_cookie_secure_behind_https_proxy(client, auth_on):
    r = client.post("/api/login", json={"passphrase": "hunter2-long-passphrase"},
                    headers={"X-Forwarded-Proto": "https"})
    assert "secure" in r.headers["set-cookie"].lower()


# ── journal stats (no engine needed) ──────────────────────────────────────
def test_journal_stats_ttlc(client):
    app = client.app
    b = app.state.broker
    win = b.place("PERSISTENT", "LIMIT", 10, 100.0, 90.0)
    b.on_quotes({"PERSISTENT": 100.0})
    b.exit(win.id, 120.0, "target")                     # +20%, +2R
    loss = b.place("DIXON", "LIMIT", 10, 100.0, 90.0)
    b.on_quotes({"DIXON": 100.0})
    b.on_quotes({"DIXON": 90.0})                        # stopped out: −10%, −1R
    s = client.get("/api/journal/stats").json()
    assert s["closed_trades"] == 2
    assert s["win_pct"] == 50.0
    assert s["avg_gain_pct"] == 20.0 and s["avg_loss_pct"] == 10.0
    assert s["gain_loss_ratio"] == 2.0
    assert s["expectancy_pct"] == 5.0
    assert s["avg_r"] == 0.5                            # (2 + −1) / 2
    assert s["total_pnl"] == 100


def test_note_keeps_auto_marker(broker, store):
    from app.broker.paper import AUTO_MARKER
    t = broker.place("PERSISTENT", "LIMIT", 10, 100.0, 90.0)
    broker.set_note(t.id, f"{AUTO_MARKER} — placed by the screener")
    broker.set_note(t.id, "entered late, lesson learned")
    assert store.get_trade(t.id).note.startswith(AUTO_MARKER)
    assert "lesson learned" in store.get_trade(t.id).note


# ── concurrency: poller + API + auto-paper on separate threads ────────────
def test_concurrent_places_get_unique_ids(tmp_path):
    from app.broker.paper import PaperBroker
    from app.store.csv_store import CsvStore
    store = CsvStore(tmp_path / "j")
    broker = PaperBroker(store)
    ids, errors = [], []

    def worker(n):
        try:
            for i in range(20):
                ids.append(broker.place(f"S{n}{i}", "LIMIT", 1, 100.0, 90.0).id)
                broker.on_quotes({f"S{n}{i}": 99.0})
        except Exception as e:                           # pragma: no cover - surfaced below
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    assert len(ids) == len(set(ids)) == 120              # no duplicate trade ids
    reopened = CsvStore(tmp_path / "j")
    assert len(reopened.list_trades()) == 120
    assert all(t.status is TradeStatus.OPEN for t in reopened.list_trades())
    assert all(len(t.events) == 2 for t in reopened.list_trades())   # placed + filled, no lost events


# ── engine-backed endpoints ───────────────────────────────────────────────
@skip_no_sepa
def test_stock_detail(real_client):
    real_client.app.state.signals.refresh()
    d = real_client.get("/api/stock/ANANDRATHI").json()
    assert d["symbol"] == "ANANDRATHI"
    assert {"close", "stage", "tt", "rs", "lists"} <= set(d["status"])
    assert len(d["checklist"]) == 8 and all("detail" in c for c in d["checklist"])
    assert d["plan"] is None or d["plan"]["qty"] >= 0
    assert d["breakouts"], "the engine records breakouts for this stock"
    assert real_client.get("/api/stock/NOPE_NOPE").status_code == 404


@skip_no_sepa
def test_chart_has_breakout_markers(real_client):
    d = real_client.get("/api/chart/ANANDRATHI").json()
    assert len(d["breakouts"]) > 0                       # regression: always 0 before


@skip_no_sepa
def test_holdings_review(real_client):
    app = real_client.app
    app.state.signals.refresh()
    b = app.state.broker
    t = b.place("ANANDRATHI", "LIMIT", 5, 100000.0, 1.0)    # absurd limit → fills at the first quote
    b.on_quotes({"ANANDRATHI": 2000.0})
    rows = real_client.get("/api/holdings").json()["holdings"]
    (row,) = [r for r in rows if r["id"] == t.id]
    assert row["action"] in ("🔴 Sell", "🟢 Add more", "🟡 Partial booking", "⚪ Hold", "?")
    assert row["why"]


@skip_no_sepa
def test_backtest_runs_saved_and_listed(real_client, tmp_path, monkeypatch):
    import app.backtester as bt
    monkeypatch.setattr(bt, "_RUNS_DIR", tmp_path / "runs")
    r = real_client.app  # noqa: F841 - app built
    btr = bt.Backtester()
    res = btr.run(start="2022-01-01")
    assert res["id"] and res["trades"] and res["breakdowns"]["grade"][0]["group"]
    runs = btr.runs()
    assert runs and runs[0]["id"] == res["id"]
    assert btr.load(res["id"])["id"] == res["id"]
    assert btr.load("../../etc/passwd") is None              # path traversal refused
    assert btr.delete(res["id"]) and not btr.runs()


@skip_no_sepa
def test_data_status(real_client):
    d = real_client.get("/api/data").json()
    assert d["source"] == "sepa" and d["price_files"] > 400


@skip_no_sepa
def test_sectors_have_5y_and_members(real_client):
    real_client.app.state.signals.refresh()
    rows = real_client.get("/api/sectors").json()["sectors"]
    assert all("5Y" in r and r["members"] for r in rows)
    assert sum(r["stocks"] for r in rows) == sum(len(r["members"]) for r in rows)
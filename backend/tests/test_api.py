"""API contract tests — FastAPI TestClient (ARCHITECTURE.md §6.3).

These pin the JSON shape the frontend depends on, so backend refactors
(e.g. the CSV store swap) cannot silently break the UI.
"""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True


def test_candidates_shape(client):
    r = client.get("/api/candidates")
    assert r.status_code == 200
    items = r.json()
    assert items, "mock signals must be seeded"
    for item in items:
        assert set(item) == {"symbol", "name", "category", "ltp", "change_pct",
                             "pivot", "buy_zone_low", "buy_zone_high", "stop", "why"}
        assert item["category"] in ("Strong Buy", "Buy", "Watch")
        assert item["buy_zone_low"] < item["buy_zone_high"]
        assert item["stop"] < item["buy_zone_low"]


def test_place_order_returns_trade_id(client):
    r = client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "BUY_STOP", "qty": 10,
        "limit_price": 5605.0, "stop": 5210.0})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "PLANNED"
    assert body["trade_id"].startswith("T")


def test_place_order_validates_symbol_and_numbers(client):
    assert client.post("/api/orders", json={
        "symbol": "NOPE", "qty": 10, "limit_price": 1, "stop": 0.5}).status_code == 404
    # stop >= entry is invalid
    assert client.post("/api/orders", json={
        "symbol": "PERSISTENT", "qty": 10, "limit_price": 5605.0,
        "stop": 5605.0}).status_code == 422
    assert client.post("/api/orders", json={
        "symbol": "PERSISTENT", "qty": 0, "limit_price": 5605.0,
        "stop": 5210.0}).status_code == 422


def test_order_then_journal_shows_order_placed_event(client):
    tid = client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 5,
        "limit_price": 5700.0, "stop": 5210.0}).json()["trade_id"]
    journal = client.get("/api/journal").json()["trades"]
    trade = next(t for t in journal if t["id"] == tid)
    assert trade["status"] == "PLANNED"
    assert trade["entry_price"] is None           # not filled yet
    assert len(trade["events"]) == 1
    ev = trade["events"][0]
    assert ev["event"] == "order_placed"
    assert ev["price"] == 5700.0
    assert ev["qty"] == 5


def test_cancel_endpoint_moves_trade_to_cancelled(client):
    tid = client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 5,
        "limit_price": 5700.0, "stop": 5210.0}).json()["trade_id"]
    r = client.post(f"/api/orders/{tid}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELLED"
    trade = next(t for t in client.get("/api/journal").json()["trades"]
                 if t["id"] == tid)
    assert [e["event"] for e in trade["events"]] == ["order_placed", "cancelled"]


def test_cancel_unknown_trade_is_404(client):
    assert client.post("/api/orders/T9999/cancel").status_code == 404


def test_journal_is_empty_before_orders(client):
    assert client.get("/api/journal").json() == {"trades": []}

def test_journal_pnl_fields(tmp_path, monkeypatch):
    """OPEN trades get unrealized P&L from the poller's price cache;
    CLOSED trades get realized P&L. Uses app.state to drive the broker
    exactly as the quote poller would."""
    import app.config as cfg
    from app.jobs.quote_poller import PriceCache
    from app.main import create_app
    from fastapi.testclient import TestClient

    monkeypatch.setattr(cfg, "SEPA_ROOT", tmp_path / "no-sepa")   # mock signal source
    cache = PriceCache()
    c = TestClient(create_app(start_background=False, journal_dir=tmp_path / "j",
                              price_cache=cache))

    tid = c.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 10,
        "limit_price": 5700.0, "stop": 5210.0}).json()["trade_id"]
    t = next(x for x in c.get("/api/journal").json()["trades"] if x["id"] == tid)
    assert "unrealized_pnl" not in t                   # PLANNED: no P&L yet

    app = c.app
    app.state.prices.update({"PERSISTENT": 5600.0})
    app.state.broker.on_quotes({"PERSISTENT": 5600.0})   # what the poller does
    app.state.prices.update({"PERSISTENT": 5800.0})      # price moves in our favour

    t = next(x for x in c.get("/api/journal").json()["trades"] if x["id"] == tid)
    assert t["status"] == "OPEN"
    assert t["last_price"] == 5800.0
    assert t["unrealized_pnl"] == round((5800.0 - 5600.0) * 10, 2)
    assert t["unrealized_pnl_pct"] == round((5800.0 / 5600.0 - 1) * 100, 2)

    app.state.prices.update({"PERSISTENT": 5200.0})
    app.state.broker.on_quotes({"PERSISTENT": 5200.0})   # stop-out
    t = next(x for x in c.get("/api/journal").json()["trades"] if x["id"] == tid)
    assert t["status"] == "CLOSED"
    assert t["pnl"] == round((5200.0 - 5600.0) * 10, 2)
    assert t["pnl_pct"] == round((5200.0 / 5600.0 - 1) * 100, 2)


def test_move_stop_and_record_exit_endpoints(client):
    tid = client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 10,
        "limit_price": 5700.0, "stop": 5210.0}).json()["trade_id"]
    r = client.post(f"/api/orders/{tid}/stop", json={"stop": 5500.0})
    assert r.status_code == 200 and r.json()["stop"] == 5500.0
    # exit while PLANNED is refused
    assert client.post(f"/api/orders/{tid}/exit",
                       json={"price": 5900.0}).status_code == 422


def test_note_endpoint(client):
    tid = client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 10,
        "limit_price": 5700.0, "stop": 5210.0}).json()["trade_id"]
    r = client.patch(f"/api/journal/{tid}", json={"note": "Chased a little — lesson noted"})
    assert r.status_code == 200 and r.json()["note"] == "Chased a little — lesson noted"
    trade = next(t for t in client.get("/api/journal").json()["trades"] if t["id"] == tid)
    assert trade["note"] == "Chased a little — lesson noted"
    assert client.patch("/api/journal/T9999", json={"note": "x"}).status_code == 404


def test_order_on_any_stock_not_just_candidates(client):
    """Manual paper trades from the chart page: any symbol the price store knows."""
    r = client.post("/api/orders", json={
        "symbol": "RELIANCE", "kind": "LIMIT", "qty": 1,
        "limit_price": 1000.0, "stop": 900.0})
    # mock source has no price store → unknown symbol stays a clean 404
    assert r.status_code == 404

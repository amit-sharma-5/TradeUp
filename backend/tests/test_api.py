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
"""Phase 2 auth: dormant without TRADEUP_PASSPHRASE, cookie-gated with it."""
import pytest

from app import auth


@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(auth, "enabled", True)
    monkeypatch.setattr(auth, "_secret", "test-pass-1234")


def test_open_when_auth_disabled(client):
    assert client.get("/api/candidates").status_code == 200


def test_locked_when_enabled(client, auth_on):
    assert client.get("/api/candidates").status_code == 401
    assert client.get("/api/health").status_code == 200          # health stays open


def test_wrong_passphrase_rejected(client, auth_on):
    r = client.post("/api/login", json={"passphrase": "nope"})
    assert r.status_code == 401


def test_login_then_access(client, auth_on):
    r = client.post("/api/login", json={"passphrase": "test-pass-1234"})
    assert r.status_code == 200
    cookie = r.cookies.get(auth.COOKIE)
    assert cookie and "." in cookie                              # payload.signature
    assert client.get("/api/candidates").status_code == 200


def test_tampered_cookie_rejected(client, auth_on):
    client.post("/api/login", json={"passphrase": "test-pass-1234"})
    client.cookies.set(auth.COOKIE, "123456.deadbeef")
    assert client.get("/api/candidates").status_code == 401
    stale_payload = "1"                                          # timestamp from 1970
    client.cookies.set(auth.COOKIE, f"{stale_payload}.{auth._sign(stale_payload)}")
    assert client.get("/api/candidates").status_code == 401      # validly signed but expired


def test_orders_and_journal_are_gated_too(client, auth_on):
    assert client.post("/api/orders", json={
        "symbol": "PERSISTENT", "qty": 1, "limit_price": 1, "stop": 0.5}).status_code == 401
    assert client.get("/api/journal").status_code == 401
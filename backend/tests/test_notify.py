"""Notifications: dormant without env vars, best-effort when enabled."""
from app.jobs import notify
from app.jobs.quote_poller import _event_text


def test_send_is_a_noop_when_not_configured(monkeypatch):
    monkeypatch.setattr(notify, "enabled", False)
    notify.send("ignored")                                  # must not raise


def test_send_posts_to_telegram_when_enabled(monkeypatch):
    calls = []
    class FakeResp:
        def read(self): return b"ok"
    def fake_urlopen(req, timeout):
        calls.append((req.full_url, req.data))
        return FakeResp()
    monkeypatch.setattr(notify, "enabled", True)
    monkeypatch.setattr(notify, "TOKEN", "T")
    monkeypatch.setattr(notify, "CHAT_ID", "C")
    monkeypatch.setattr(notify.urllib.request, "urlopen", fake_urlopen)
    notify.send("hello")
    assert len(calls) == 1 and b"chat_id=C" in calls[0][1] and b"hello" in calls[0][1]


def test_send_failure_is_swallowed(monkeypatch):
    monkeypatch.setattr(notify, "enabled", True)
    monkeypatch.setattr(notify, "TOKEN", "T")
    monkeypatch.setattr(notify, "CHAT_ID", "C")
    def boom(req, timeout): raise OSError("offline")
    monkeypatch.setattr(notify.urllib.request, "urlopen", boom)
    notify.send("hello")                                    # must not raise


def test_event_text_plain_english():
    assert _event_text({"event": "filled", "symbol": "HAL", "price": 5097.4}) == \
        "✅ HAL paper order filled @ ₹5,097.40"
    assert "chase" in _event_text({"event": "cancelled", "symbol": "HAL",
                                   "why": "ran above chase limit - no fill"})
    assert _event_text({"event": "stopped_out", "symbol": "HAL", "price": 4740.0}).startswith("🛑")
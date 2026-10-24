"""Rule profiles, auto paper trading (⚡ Buy Now), and Dhan secret storage."""
import pytest

from app.domain import Category, Signal, TradeStatus
from app.jobs.auto_paper import run_after_scan
from app.signals.mock import MockSignalSource


# ── rule profiles ─────────────────────────────────────────────────────────
def test_profile_crud_and_validation(tmp_path, monkeypatch):
    from app import profiles
    monkeypatch.setattr(profiles, "_FILE", tmp_path / "profiles.json")
    assert [p["name"] for p in profiles.list_profiles()] == ["default"]

    profiles.save("v2-tight", {"stop_pct": 5, "chase_pct": 1, "min_grade": "A", "max_pos": 6})
    assert profiles.params_for("v2-tight") == {"stop_pct": 5.0, "chase_pct": 1.0,
                                               "min_grade": "A", "max_pos": 6}
    assert profiles.params_for("default") == {}          # default = engine defaults

    with pytest.raises(ValueError):
        profiles.save("v2-tight", {"stop_pct": 50})       # outside sane range
    with pytest.raises(ValueError):
        profiles.save("bad name!", {})
    with pytest.raises(ValueError):
        profiles.delete("default")
    profiles.save("v3", {})
    profiles.delete("v3")
    assert "v3" not in [p["name"] for p in profiles.list_profiles()]


# ── auto paper trading ────────────────────────────────────────────────────
def _sig(sym, cat):
    return Signal(symbol=sym, name=sym, category=cat, ltp=100.0, change_pct=1.0,
                  pivot=100.0, stop=93.0, why="test")


def test_auto_paper_places_orders_for_new_strong_candidates(broker, store):
    cands = [_sig("AAA", Category.STRONG_BUY), _sig("BBB", Category.BUY),
             _sig("CCC", Category.WATCH)]                  # Watch is never auto-traded
    plan = lambda pivot, entry, stop: {"qty": 10, "problems": []}
    placed = run_after_scan(cands, broker, lambda: {"auto_paper": True}, plan)
    assert sorted(placed) == ["AAA ×10", "BBB ×10"]
    trades = store.list_trades()
    assert {t.symbol for t in trades} == {"AAA", "BBB"}
    assert all(t.status is TradeStatus.PLANNED for t in trades)
    assert all("auto" in t.note for t in trades)           # journaled as machine trades


def test_auto_paper_never_duplicates_and_respects_setting(broker, store):
    cands = [_sig("AAA", Category.STRONG_BUY)]
    plan = lambda pivot, entry, stop: {"qty": 10, "problems": []}
    run_after_scan(cands, broker, lambda: {"auto_paper": True}, plan)
    assert run_after_scan(cands, broker, lambda: {"auto_paper": True}, plan) == []
    assert len(store.list_trades()) == 1                   # second scan skipped the symbol

    assert run_after_scan(cands, broker, lambda: {"auto_paper": False}, plan) == []


def test_auto_paper_skips_rule_warnings(broker, store):
    cands = [_sig("AAA", Category.STRONG_BUY)]
    plan = lambda pivot, entry, stop: {"qty": 0, "problems": ["entry extended"]}
    assert run_after_scan(cands, broker, lambda: {"auto_paper": True}, plan) == []
    assert store.list_trades() == []


# ── Dhan secrets ──────────────────────────────────────────────────────────
def test_dhan_secrets_stored_masked_and_never_returned(tmp_path, monkeypatch):
    from app import secrets
    monkeypatch.setattr(secrets, "_FILE", tmp_path / ".env")
    st = secrets.set_dhan("my-client-id-123456", "my-token-abcdef987654")
    assert st["configured"] is True
    assert st["client_id"] == "my…56"                      # masked preview (first2…last2)
    assert "my-token-abcdef987654" not in str(st)          # full token never returned
    raw = (tmp_path / ".env").read_text()
    assert "DHAN_ACCESS_TOKEN=my-token-abcdef987654" in raw
    assert secrets.dhan_credentials()["access_token"] == "my-token-abcdef987654"

    with pytest.raises(ValueError):
        secrets.set_dhan("", "tok")


# ── settings gains the new keys ───────────────────────────────────────────
def test_settings_auto_paper_and_profile(tmp_path, monkeypatch):
    import app.settings as s
    monkeypatch.setattr(s, "_FILE", tmp_path / "settings.json")
    out = s.put({"auto_paper": True, "active_profile": "v2-tight"})
    assert out["auto_paper"] is True and out["active_profile"] == "v2-tight"
    assert s.get()["auto_paper"] is True


def test_mock_source_has_no_auto_scan_hook(client):
    """The mock source (CI) simply has no scan hook — nothing to explode."""
    r = client.get("/api/health")
    assert r.status_code == 200
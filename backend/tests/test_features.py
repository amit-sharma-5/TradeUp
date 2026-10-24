"""Feature-parity endpoints: settings, ticket sizing, watchlists, journal export.
SEPA-dependent ones skip when the engine is absent (CI)."""
import csv
import io

import pytest

from app.config import SEPA_ROOT

SEPA_OK = (SEPA_ROOT / "sepa" / "backtest.py").exists()
skip_no_sepa = pytest.mark.skipif(not SEPA_OK, reason="SEPA engine not available")


def test_settings_roundtrip(tmp_path, monkeypatch):
    import app.settings as s
    monkeypatch.setattr(s, "_FILE", tmp_path / "settings.json")
    assert s.get()["risk_pct"] == 1.25                 # engine default
    out = s.put({"equity": 2500000, "risk_pct": 1.0})
    assert (out["equity"], out["risk_pct"], out["max_pos_pct"]) == (2500000.0, 1.0, 20.0)
    assert out["auto_paper"] is False                  # safe default: no auto orders
    assert out["active_profile"] == "default"
    assert s.get()["equity"] == 2500000.0              # survives a "restart"


def test_journal_csv_export(client):
    client.post("/api/orders", json={
        "symbol": "PERSISTENT", "kind": "LIMIT", "qty": 5,
        "limit_price": 5700.0, "stop": 5210.0})
    r = client.get("/api/journal.csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 1 and rows[0]["symbol"] == "PERSISTENT"


def test_watchlists_need_sepa(client):
    assert client.get("/api/watchlists").status_code == 503


def test_ticket_needs_sepa(client):
    assert client.get("/api/ticket/PERSISTENT").status_code == 503


@skip_no_sepa
@pytest.mark.parametrize("path", ["/api/watchlists"])
def test_watchlists_shape(real_client, path):
    real_client.app.state.signals.refresh()            # the scan the UI would have triggered
    r = real_client.get(path)
    assert r.status_code == 200
    d = r.json()
    assert d["asof"]
    for k in ("Uptrend (no base)", "Leaders", "Sell-Avoid", "Earnings x Tech", "Market"):
        assert k in d
    for row in d["Leaders"][:5]:
        assert "symbol" in row and "rs" in row


@skip_no_sepa
def test_ticket_sizing_rules(real_client):
    """Sizing comes from the engine's rule: equity × risk% ÷ (entry − stop),
    capped by max_pos_pct of equity (engine default 12.5%)."""
    r = real_client.get("/api/ticket/PERSISTENT",
                        params={"entry": 5605.0, "stop": 5210.0, "equity": 1000000})
    assert r.status_code == 200
    p = r.json()
    by_risk = 1_000_000 * 1.25 / 100 / (5605.0 - 5210.0)      # ≈ 31.6 shares
    by_cap = 1_000_000 * 12.5 / 100 / 5605.0                  # ≈ 22.3 shares
    assert p["qty"] == int(min(by_risk, by_cap))
    assert p["capped"] is (by_cap < by_risk)
    assert p["risk_rs"] == round(p["qty"] * (5605.0 - 5210.0), 2)
    assert isinstance(p["problems"], list)


@skip_no_sepa
def test_news_degrades_gracefully(real_client):
    """Network may be off / rate-limited — the endpoint must answer, not 500."""
    r = real_client.get("/api/news/PERSISTENT")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))
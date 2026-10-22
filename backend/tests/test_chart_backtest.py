"""Chart + backtest endpoints. These need the SEPA engine + price store, so
they skip when it is absent (CI) — locally they run against the real data."""
import os

import pytest

from app.config import SEPA_ROOT

pytestmark = pytest.mark.skipif(
    not (SEPA_ROOT / "sepa" / "backtest.py").exists(),
    reason="SEPA engine not available")


@pytest.fixture
def real_client(tmp_path, monkeypatch):
    import app.config as cfg
    from app.main import create_app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(cfg, "SEPA_ROOT", SEPA_ROOT)
    monkeypatch.setattr(cfg, "JOURNAL_DIR", tmp_path / "journal")
    return TestClient(create_app(start_background=False, journal_dir=tmp_path / "journal"))


def test_chart_payload(real_client):
    r = real_client.get("/api/chart/PERSISTENT")
    assert r.status_code == 200
    d = r.json()
    assert len(d["candles"]) > 200 and d["candles"][-1]["close"] > 0
    assert len(d["ma50"]) > 100
    assert set(d) >= {"symbol", "candles", "ma50", "ma200", "pivot", "stop", "stage", "rs", "tt", "breakouts"}


def test_chart_unknown_symbol_404(real_client):
    assert real_client.get("/api/chart/NO_SUCH_TICKER_XYZ").status_code == 404


def test_chart_days_param_limits_payload(real_client):
    full = real_client.get("/api/chart/PERSISTENT").json()
    short = real_client.get("/api/chart/PERSISTENT", params={"days": 60}).json()
    assert len(short["candles"]) < len(full["candles"])


def test_backtest_run_and_result(real_client):
    r = real_client.post("/api/backtest", json={"start": "2020-01-01", "max_pos": 8})
    assert r.status_code == 200 and r.json()["started"] is True
    # wait for the background run (warm cache: seconds)
    import time
    for _ in range(60):
        s = real_client.get("/api/backtest").json()
        if not s["running"]:
            break
        time.sleep(1)
    assert "failed" not in s["status"], s["status"]
    res = s["result"]
    assert res and res["summary"][0]["trades"] > 0
    assert len(res["portfolio"]["curve"]) > 100
    assert "grade" in res["breakdowns"]
    first_row = res["breakdowns"]["grade"][0]
    assert "expectancy%" in first_row and "profit factor" in first_row


def test_backtest_concurrent_run_is_refused(real_client):
    r1 = real_client.post("/api/backtest", json={"start": "2024-01-01"})
    assert r1.json()["started"] is True
    r2 = real_client.post("/api/backtest", json={"start": "2024-01-01"})
    assert r2.json()["started"] is False          # already running
    import time
    for _ in range(60):
        if not real_client.get("/api/backtest").json()["running"]:
            break
        time.sleep(1)

def test_symbols_endpoint(real_client):
    r = real_client.get("/api/symbols")
    assert r.status_code == 200
    syms = r.json()
    assert len(syms) > 400                          # the NIFTY 500 member list
    assert {"symbol", "name", "industry"} <= set(syms[0])
    assert any(s["symbol"] == "HAL" for s in syms)

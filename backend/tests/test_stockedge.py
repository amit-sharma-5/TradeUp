"""StockEdge upload + status endpoints, against a fake export folder."""
import pytest

from app import stockedge_admin


def test_save_upload_writes_file_and_rejects_junk(tmp_path, monkeypatch):
    monkeypatch.setattr(stockedge_admin, "_folder", lambda: tmp_path)
    name = stockedge_admin.save_upload("stockedge_q3.xlsx", b"not-really-excel")
    assert (tmp_path / "stockedge_q3.xlsx").read_bytes() == b"not-really-excel"

    for bad in ("../evil.xlsx", "sub/dir/x.csv", "", "x.csv.bak", "no-ext",
                "double..csv", ".hidden.csv"):
        with pytest.raises(ValueError):
            stockedge_admin.save_upload(bad, b"data")

    with pytest.raises(ValueError):
        stockedge_admin.save_upload("ok.csv", b"")          # empty
    with pytest.raises(ValueError):
        stockedge_admin.save_upload("big.csv", b"x" * (26 * 1024 * 1024))  # > 25 MB


def test_upload_endpoint_requires_sepa(client):
    r = client.post("/api/stockedge/upload",
                    files={"file": ("x.csv", b"a,b\n1,2")})
    assert r.status_code == 503                          # mock source: no SEPA


def test_stockedge_status_requires_sepa(client):
    assert client.get("/api/stockedge").status_code == 503
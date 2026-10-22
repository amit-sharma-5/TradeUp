"""Shared fixtures: a fresh store + broker + FastAPI app per test."""
import pytest
from fastapi.testclient import TestClient

from app.broker.paper import PaperBroker
from app.main import create_app
from app.signals.mock import MockSignalSource
from app.store.memory import InMemoryStore


@pytest.fixture
def store():
    return InMemoryStore()


@pytest.fixture
def broker(store):
    return PaperBroker(store)


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Fresh app per test; journal goes to a temp dir, no background threads,
    # and the SEPA engine is "absent" so the mock signal source is used.
    import app.config as cfg
    monkeypatch.setattr(cfg, "SEPA_ROOT", tmp_path / "no-sepa")
    monkeypatch.setattr(cfg, "JOURNAL_DIR", tmp_path / "journal")
    return TestClient(create_app(start_background=False, journal_dir=tmp_path / "journal"))


@pytest.fixture
def signals():
    return MockSignalSource().get_candidates()


@pytest.fixture
def persistent_sig(signals):
    """The STRONG_BUY mock signal, handy for order placement."""
    return next(s for s in signals if s.symbol == "PERSISTENT")
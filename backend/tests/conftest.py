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
def client():
    # Fresh app per test so orders/journal state never leaks between tests.
    return TestClient(create_app())


@pytest.fixture
def signals():
    return MockSignalSource().get_candidates()


@pytest.fixture
def persistent_sig(signals):
    """The STRONG_BUY mock signal, handy for order placement."""
    return next(s for s in signals if s.symbol == "PERSISTENT")
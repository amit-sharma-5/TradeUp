"""Signal source seam (ARCHITECTURE.md D5): the real SEPA adapter lands in
signals/adapter.py (backlog item 3) and must be reviewed with the owner first."""
from ..domain import Category, Signal


class SignalSource:
    def get_candidates(self) -> list[Signal]:
        raise NotImplementedError


class MockSignalSource(SignalSource):
    """Three fake signals so the UI and tests run without the real engine."""
    SIGNALS = [
        Signal("CRAFTSMAN", "Craftsman Automation", Category.WATCH, 11002.0, 1.2, 11353.0, 10250.0,
               "Strong uptrend, forming a handle; buy on a breakout above ₹11,353 with volume"),
        Signal("PERSISTENT", "Persistent Systems", Category.STRONG_BUY, 5740.0, 2.1, 5605.0, 5210.0,
               "Broke out of a 7-week flat base today with 1.6x volume; RS 94; EPS accelerating"),
        Signal("DIXON", "Dixon Technologies", Category.BUY, 14210.0, 0.8, 13980.0, 13010.0,
               "Cup-with-handle buy point ₹13,980; price just re-entered the buy zone"),
    ]

    def get_candidates(self) -> list[Signal]:
        return list(self.SIGNALS)
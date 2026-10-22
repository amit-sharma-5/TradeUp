"""Live paper fills: a periodic quote poll feeds PaperBroker.on_quotes.

The fill rules existed but nothing called them. Phase 1 polls Yahoo for the
symbols of active trades (usually 0-5 symbols, so a 1-minute-bar download is
cheap) every QUOTE_INTERVAL seconds. Phase 2 swaps the fetch function for the
Dhan WebSocket without touching the broker.

Caveat, accepted for Phase 1: outside market hours the "LTP" is the last
traded price, so a LIMIT below yesterday's close fills at that stale price —
the same semantics as the proven daily simulation.
"""
import os
import threading
import time
import traceback

from ..broker.base import Broker
from ..store.base import Store

QUOTE_INTERVAL = int(os.getenv("TRADEUP_QUOTE_INTERVAL", "15"))


def yahoo_quotes(symbols: list[str]) -> dict[str, float]:
    """symbol → last traded price from Yahoo 1-minute bars (f"{sym}.NS")."""
    import pandas as pd
    import yfinance as yf

    if not symbols:
        return {}
    data = yf.download([f"{s}.NS" for s in symbols], period="1d", interval="1m",
                       progress=False, group_by="ticker", threads=True, auto_adjust=False)
    out: dict[str, float] = {}
    single = not isinstance(data.columns, pd.MultiIndex)
    for s in symbols:
        try:
            d = data if single else data[f"{s}.NS"]
            d = d.dropna(subset=["Close"])
            if len(d):
                out[s] = float(d["Close"].iloc[-1])
        except Exception:
            continue
    return out


class QuotePoller:
    def __init__(self, broker: Broker, store: Store, fetch=yahoo_quotes,
                 interval: int = QUOTE_INTERVAL):
        self._broker = broker
        self._store = store
        self._fetch = fetch
        self._interval = interval
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._last_ok: str = ""
        self._last_error: str = ""

    def poll_once(self) -> list[dict]:
        """One fill pass: fetch quotes for active-trade symbols, apply fill rules."""
        symbols = sorted({t.symbol for t in self._store.active_trades()})
        if not symbols:
            return []                       # nothing to fill → no network call at all
        quotes = self._fetch(symbols)
        events = self._broker.on_quotes(quotes)
        self._last_ok = time.strftime("%Y-%m-%d %H:%M:%S")
        return events

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True, name="quote-poll")
            self._thread.start()

    def stop(self):
        self._stop.set()

    def status(self) -> dict:
        return {"interval_s": self._interval, "last_poll": self._last_ok,
                "last_error": self._last_error}

    def _loop(self):
        while not self._stop.wait(self._interval):
            try:
                self.poll_once()
            except Exception:
                self._last_error = traceback.format_exc(limit=1).strip()
                traceback.print_exc()       # keep polling; next pass retries
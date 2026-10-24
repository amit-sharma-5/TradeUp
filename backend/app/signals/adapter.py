"""SEPA adapter: the proven engine imported as a library, never ported (D1).

Flow (mirrors ../SEPA-terminal/run_daily.py's screen step):
    scan.run_all(DEFAULT) -> (feats, events, ...)
    scan.attach_cross(feats, DEFAULT)
    screener.screen(feats, events, DEFAULT) -> (asof, {"Strong Buy": df, "Buy": df, "Watch": df, ...})

It reads the SEPA repo's own price store (full NSE history, already populated and
warm-cached), so TradeUp needs no first-time download. The mapping from screener
rows to our Signal model is a pure function (row_to_signal) so it can be unit
tested without the engine.
"""
import sys
import threading
import time
import traceback
from pathlib import Path

from ..config import SEPA_ROOT
from ..domain import Category, Signal
from .mock import SignalSource

STOP_PCT = 7.0          # sepa/params.py DEFAULT.stop_pct — stop distance below pivot
CATEGORIES = [("Strong Buy", Category.STRONG_BUY), ("Buy", Category.BUY), ("Watch", Category.WATCH)]


class SepaUnavailable(RuntimeError):
    """The SEPA engine/store is missing or failed; the caller falls back to mock."""


def _engine_params(params_get):
    """DEFAULT rules + the active rule profile's overrides, filtered to the
    fields the engine's P actually has (profile keys like max_pos are
    portfolio-level and are consumed by the backtester, not the screener)."""
    from dataclasses import fields, replace
    from sepa.params import DEFAULT
    p = DEFAULT
    if params_get:
        try:
            ov = params_get() or {}
        except Exception:
            ov = {}
        valid = {f.name for f in fields(p)}
        ov = {k: v for k, v in ov.items() if k in valid}
        if ov:
            p = replace(p, **ov)
    return p


def row_to_signal(row: dict, category: Category, change_pct: float) -> Signal | None:
    """Map one screener row to a Signal. Returns None when there is no usable pivot."""
    pivot = row.get("buy_pivot")
    if pivot is None or pivot != pivot:                 # NaN check
        pivot = row.get("pivot")
    if pivot is None or pivot != pivot or pivot <= 0:
        return None
    close = row.get("close") or pivot
    return Signal(
        symbol=row["symbol"],
        name=str(row.get("name") or row["symbol"]),
        category=category,
        ltp=round(float(close), 2),
        change_pct=round(float(change_pct), 2),
        pivot=round(float(pivot), 2),
        stop=round(float(pivot) * (1 - STOP_PCT / 100), 2),
        why=str(row.get("why") or ""))


class SepaSignalSource(SignalSource):
    """get_candidates() serves the last successful scan; refresh() runs the engine.

    A full scan over ~500 symbols takes minutes when the cache is cold, so refresh
    runs in a background thread and the API never blocks on it.
    """

    def __init__(self, sepa_root: Path = None, params_get=None):
        self._root = Path(sepa_root) if sepa_root else None
        self._params_get = params_get        # callable -> engine-param overrides (rule profile)
        self._on_scan = None                 # callable invoked after each completed scan
        self._signals: list[Signal] = []
        self._asof: str = ""
        self._out: dict | None = None         # the raw screener output (all lists)
        self._status = "not run yet"    # human-readable last-refresh state
        self._lock = threading.Lock()
        self._refreshing = False

    # ── public surface ─────────────────────────────────────────────────────
    def get_candidates(self) -> list[Signal]:
        with self._lock:
            return list(self._signals)

    @property
    def status(self) -> dict:
        with self._lock:
            return {"asof": self._asof, "status": self._status,
                    "refreshing": self._refreshing, "count": len(self._signals)}

    def last_screen(self) -> tuple[str, dict] | None:
        """(asof, screener output dict) from the last successful scan, or None."""
        with self._lock:
            return (self._asof, self._out) if self._out is not None else None

    def refresh_async(self):
        """Kick a background refresh (no-op while one is already running)."""
        with self._lock:
            if self._refreshing:
                return False
            self._refreshing = True
        threading.Thread(target=self._refresh_run, daemon=True).start()
        return True

    def refresh(self) -> list[Signal]:
        """Synchronous scan — used by tests and the scheduler."""
        signals, asof, out = self._run_engine()
        with self._lock:
            self._signals, self._asof, self._out = signals, asof, out
            self._status = f"ok, {len(signals)} candidates as of {asof}"
        if self._on_scan:
            try:
                self._on_scan()               # e.g. auto paper trading; must not break the scan
            except Exception:
                traceback.print_exc()
        return signals

    # ── internals ──────────────────────────────────────────────────────────
    def _refresh_run(self):
        try:
            self.refresh()
        except Exception:
            with self._lock:
                self._refreshing = False
                self._status = "refresh failed: " + traceback.format_exc(limit=1).strip()
            return
        with self._lock:
            self._refreshing = False

    def _run_engine(self) -> tuple[list[Signal], str]:
        if not (self._root / "sepa" / "scan.py").exists():
            raise SepaUnavailable(f"SEPA engine not found at {self._root}")
        if str(self._root) not in sys.path:
            sys.path.insert(0, str(self._root))
        try:
            from sepa import scan, screener
            from sepa.params import DEFAULT
        except ImportError as e:
            raise SepaUnavailable(f"cannot import sepa: {e}") from e

        p = _engine_params(self._params_get)
        feats, ev, _ = scan.run_all(p)
        scan.attach_cross(feats, p)
        asof, out = screener.screen(feats, ev, p)

        def chg(sym: str) -> float:
            f = feats.get(sym)
            if f is None or len(f) < 2:
                return 0.0
            return (f["close"].iloc[-1] / f["close"].iloc[-2] - 1) * 100

        signals = []
        for label, category in CATEGORIES:
            df = out.get(label)
            if df is None or not len(df):
                continue
            for row in df.to_dict("records"):
                sig = row_to_signal(row, category, chg(row["symbol"]))
                if sig is not None:
                    signals.append(sig)
        return signals, str(asof.date()), out
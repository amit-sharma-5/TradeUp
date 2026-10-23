"""Backtest: the SEPA rules replayed over history, via the imported backtester.

Same pipeline as ../SEPA-terminal/run_backtest.py (scan.run_all -> backtest.run
-> breakdown / portfolio / curve_stats) but returning JSON instead of an Excel
file, so the Backtest page can show: SEPA-filtered vs all-breakouts baseline,
stats, per-grade/type breakdowns and the daily equity curve.

The full run takes seconds with a warm engine cache, minutes cold, so the
endpoint runs in a background thread and serves the last completed result.
"""
import sys
import threading
import time
import traceback

from . import config

# breakdown tables we expose (SEPA computes more: period, rs bucket, volume…)
_BREAKDOWNS = ("grade", "type", "base", "reason")


def _j(v):
    """JSON-safe scalar (numpy -> python, NaN -> None)."""
    try:
        import math
        import numpy as np
        if isinstance(v, (np.floating,)):
            return None if not math.isfinite(v) else float(v)
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, float) and not math.isfinite(v):
            return None
    except ImportError:
        pass
    return v


def _df_records(df):
    return [{k: _j(v) for k, v in row.items()} for row in df.to_dict("records")]


class Backtester:
    def __init__(self):
        self._result: dict | None = None
        self._running = False
        self._status = "not run yet"
        self._lock = threading.Lock()

    @property
    def status(self) -> dict:
        with self._lock:
            return {"running": self._running, "status": self._status,
                    "has_result": self._result is not None}

    def result(self) -> dict | None:
        with self._lock:
            return self._result

    def run_async(self, start: str = "2012-01-01", stop_pct: float | None = None,
                  chase_pct: float | None = None, max_pos: int = 8,
                  grade: str | None = None):
        with self._lock:
            if self._running:
                return False
            self._running = True
        threading.Thread(target=self._run_thread, daemon=True,
                         args=(start, stop_pct, chase_pct, max_pos, grade)).start()
        return True

    def run(self, start: str = "2012-01-01", stop_pct: float | None = None,
            chase_pct: float | None = None, max_pos: int = 8,
            grade: str | None = None) -> dict:
        """Synchronous run — used by tests and the background thread."""
        root = config.SEPA_ROOT
        if not (root / "sepa" / "backtest.py").exists():
            raise FileNotFoundError(f"SEPA engine not found at {root}")
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        from dataclasses import replace
        from sepa import backtest, scan, store as sepa_store
        from sepa.params import DEFAULT

        p = DEFAULT
        overrides = {}
        if stop_pct is not None:
            overrides["stop_pct"] = stop_pct
        if chase_pct is not None:
            overrides["chase_pct"] = chase_pct
        if grade:
            overrides["min_grade"] = grade
        if overrides:
            p = replace(p, **overrides)

        feats, ev, _src = scan.run_all(p)
        scan.attach_cross(feats, p)
        bench, bench_src = sepa_store.benchmark()

        sepa = backtest.run(ev, feats, p, True, start)
        base = backtest.run(ev, feats, p, False, start)
        bd = backtest.breakdown(sepa)
        curve = backtest.portfolio(sepa, max_pos)
        cs = backtest.curve_stats(curve, bench)

        result = {
            "asof": str(max(f.index[-1] for f in feats.values()).date()),
            "start": start, "params": {"stop_pct": p.stop_pct, "chase_pct": p.chase_pct,
                                       "max_pos": max_pos, "min_grade": p.min_grade},
            "benchmark_source": bench_src,
            "stocks": len(feats), "breakouts": len(ev),
            "summary": [
                {"set": "SEPA rules (TT + Stage 2 + RS≥70)", **{k: _j(v) for k, v in backtest._stats(sepa).items()}},
                {"set": "Baseline (all breakouts, same exits)", **{k: _j(v) for k, v in backtest._stats(base).items()}},
            ],
            "breakdowns": {k: _df_records(bd[k]) for k in _BREAKDOWNS if k in bd},
            "portfolio": {**{k: _j(v) for k, v in cs.items()},
                          "curve": [{"date": str(ix.date()), "equity": _j(r.equity),
                                     "invested": _j(r.invested)}
                                    for ix, r in curve.iterrows()]},
        }
        with self._lock:
            self._result = result
            self._status = f"ok: {result['summary'][0].get('trades', '?')} SEPA trades since {start}"
        return result

    def _run_thread(self, *args):
        try:
            self.run(*args)
        except Exception:
            traceback.print_exc()
            with self._lock:
                self._status = "backtest failed: " + traceback.format_exc(limit=1).strip()
        finally:
            with self._lock:
                self._running = False
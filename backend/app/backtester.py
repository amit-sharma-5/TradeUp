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

# breakdown tables we expose (SEPA computes more: rs bucket, volume…)
_BREAKDOWNS = ("grade", "type", "base", "period", "reason")
_RUNS_DIR = config.DATA_DIR / "backtests"


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
    """Rows with the group label kept (breakdown frames are indexed by it)."""
    out = []
    for idx, row in zip(df.index, df.to_dict("records")):
        out.append({"group": str(idx), **{k: _j(v) for k, v in row.items()}})
    return out


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
                  chase_pct: float | None = None, max_pos: int | None = None,
                  grade: str | None = None, profile: str | None = None):
        with self._lock:
            if self._running:
                return False
            self._running = True
        threading.Thread(target=self._run_thread, daemon=True,
                         args=(start, stop_pct, chase_pct, max_pos, grade, profile)).start()
        return True

    def run(self, start: str = "2012-01-01", stop_pct: float | None = None,
            chase_pct: float | None = None, max_pos: int | None = None,
            grade: str | None = None, profile: str | None = None) -> dict:
        """Synchronous run — used by tests and the background thread."""
        root = config.SEPA_ROOT
        if not (root / "sepa" / "backtest.py").exists():
            raise FileNotFoundError(f"SEPA engine not found at {root}")
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        from dataclasses import replace
        from sepa import backtest, scan, store as sepa_store
        from sepa.params import DEFAULT

        from dataclasses import fields
        from . import profiles as rule_profiles
        p = DEFAULT
        overrides = {}
        if profile:                                   # a named rule version first
            overrides.update(rule_profiles.params_for(profile))
        # max_pos is portfolio-level (how many slots the curve holds), not an
        # engine field — route it to the portfolio() call instead of P.
        profile_max_pos = overrides.pop("max_pos", None)
        valid = {f.name for f in fields(p)}
        overrides = {k: v for k, v in overrides.items() if k in valid}
        if stop_pct is not None:
            overrides["stop_pct"] = stop_pct
        if chase_pct is not None:
            overrides["chase_pct"] = chase_pct
        if grade:
            overrides["min_grade"] = grade
        if overrides:
            p = replace(p, **overrides)
        if max_pos is None:
            max_pos = profile_max_pos or 8            # profile version, else the default

        feats, ev, _src = scan.run_all(p)
        scan.attach_cross(feats, p)
        bench, bench_src = sepa_store.benchmark()

        sepa = backtest.run(ev, feats, p, True, start)
        base = backtest.run(ev, feats, p, False, start)
        bd = backtest.breakdown(sepa)
        curve = backtest.portfolio(sepa, max_pos)
        cs = backtest.curve_stats(curve, bench)

        # The honest period: the requested start is only an upper bound — the
        # test cannot begin before the price store does. Report what was used.
        first_trade = str(sepa["date"].min())[:10] if len(sepa) else None
        data_from = str(min(f.index[0] for f in feats.values()).date())
        result = {
            "asof": str(max(f.index[-1] for f in feats.values()).date()),
            "start": start, "profile": profile,
            "data_from": data_from, "first_trade": first_trade,
            "start_clipped": bool(first_trade and first_trade[:4] > start[:4]),
            "params": {"stop_pct": p.stop_pct, "chase_pct": p.chase_pct,
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
        trades_cols = ["symbol", "date", "type", "grade", "base_no", "entry", "exit_date",
                       "exit", "ret", "r", "bars", "reason"]
        result["trades"] = [{k: _j(v) for k, v in row.items()}
                            for row in sepa[[c for c in trades_cols if c in sepa]].to_dict("records")]
        result["id"] = time.strftime("%Y%m%d-%H%M%S")
        result["label"] = f"{profile or 'default'} · {first_trade or start} → {result['asof']}"
        self._save(result)
        with self._lock:
            self._result = result
            self._status = (f"ok: {result['summary'][0].get('trades', '?')} SEPA trades, "
                            f"{first_trade or start} → {result['asof']}")
        return result

    # ── saved runs (compare versions) ──────────────────────────────────────
    def _save(self, result: dict):
        import json
        _RUNS_DIR.mkdir(parents=True, exist_ok=True)
        f = _RUNS_DIR / f"{result['id']}.json"
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(result, default=str))
        tmp.replace(f)

    def runs(self) -> list[dict]:
        """Summary of every saved run, newest first."""
        import json
        out = []
        for f in sorted(_RUNS_DIR.glob("*.json"), reverse=True) if _RUNS_DIR.exists() else []:
            try:
                r = json.loads(f.read_text())
            except Exception:
                continue
            s0 = (r.get("summary") or [{}])[0]
            pf = r.get("portfolio") or {}
            out.append({"id": r.get("id", f.stem), "label": r.get("label", f.stem),
                        "profile": r.get("profile"), "start": r.get("first_trade") or r.get("start"),
                        "params": r.get("params"), "asof": r.get("asof"),
                        "trades": s0.get("trades"), "win%": s0.get("win%"),
                        "expectancy%": s0.get("expectancy%"),
                        "CAGR%": pf.get("CAGR%"), "max DD%": pf.get("max DD%")})
        return out

    def load(self, run_id: str) -> dict | None:
        import json
        if not run_id.replace("-", "").isdigit():
            return None
        f = _RUNS_DIR / f"{run_id}.json"
        if not f.exists():
            return None
        r = json.loads(f.read_text())
        with self._lock:
            self._result = r
        return r

    def delete(self, run_id: str) -> bool:
        if not run_id.replace("-", "").isdigit():
            return False
        f = _RUNS_DIR / f"{run_id}.json"
        if f.exists():
            f.unlink()
            return True
        return False

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
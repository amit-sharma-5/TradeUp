"""Chart data: OHLCV + engine annotations for one symbol, served to the chart page.

Data comes from the SEPA price store (via sepa.store.load, which also applies the
owner's corporate-action fixes) and sepa.scan.analyze_symbol for the MAs, stage,
pivot and breakout marks — the same numbers the screener is built on.
"""
import sys
from pathlib import Path

from . import config


def _ensure_sepa():
    root = config.SEPA_ROOT
    if not (root / "sepa" / "store.py").exists():
        raise FileNotFoundError(f"SEPA engine not found at {root}")
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def build_chart(symbol: str, days: int = 400, tf: str = "daily") -> dict:
    """JSON-ready chart payload for one symbol. tf: "daily" or "weekly"
    (weekly = OHLCV resampled to calendar weeks, with 10/30/40-week MAs —
    the same convention the SEPA terminal's weekly view uses)."""
    _ensure_sepa()
    from sepa import scan, store as sepa_store
    from sepa.params import DEFAULT

    symbol = symbol.upper()
    df = sepa_store.load(symbol)                     # raises FileNotFoundError if unknown
    if df.empty:
        raise FileNotFoundError(symbol)
    bench, bench_src = sepa_store.benchmark()

    feats, ev = scan.analyze_symbol(symbol, bench, DEFAULT)
    pivot = stop = None
    stage = rs = None
    tt = False
    if feats is not None:
        scan.attach_cross({symbol: feats}, DEFAULT)   # adds tt + rs for display
        f = feats.iloc[-1]
        pivot = round(float(f.pivot), 2) if f.pivot == f.pivot else None
        stop = round(pivot * (1 - DEFAULT.stop_pct / 100), 2) if pivot else None
        stage, tt = int(f.stage), bool(f.tt)
        rs = round(float(f.rs), 1) if f.rs == f.rs else None

    if tf == "weekly":
        import pandas as pd
        weeks = max(days // 5, 60)
        w = df.tail(weeks * 7).resample("W-FRI").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
        candles = [{"date": str(ix.date()), "open": round(r.open, 2), "high": round(r.high, 2),
                    "low": round(r.low, 2), "close": round(r.close, 2),
                    "volume": int(r.volume)} for ix, r in w.iterrows()]
        ma = lambda n: [{"date": str(ix.date()), "value": round(float(v), 2)}
                        for ix, v in w["close"].rolling(n).mean().items() if v == v]
        mas = {"ma10w": ma(10), "ma30w": ma(30), "ma40w": ma(40)}
        wk_end = lambda s: pd.Timestamp(s).to_period("W-FRI").end_time.date()
        breakouts = [{"date": str(wk_end(e.date)), "price": round(float(e.pivot), 2),
                      "type": str(e.type)}
                     for e in list(_breakout_rows(symbol, ev))[-weeks:]]
    else:
        d = df.tail(days)
        candles = [{"date": str(ix.date()), "open": round(r.open, 2), "high": round(r.high, 2),
                    "low": round(r.low, 2), "close": round(r.close, 2),
                    "volume": int(r.volume)} for ix, r in d.iterrows()]
        ma = lambda col: ([{"date": str(ix.date()), "value": round(float(v), 2)}
                           for ix, v in feats[col].tail(days).items() if v == v]
                          if feats is not None else [])
        mas = {"ma50": ma("ma50"), "ma200": ma("ma200")}
        breakouts = [{"date": str(getattr(e, "date").date()), "price": round(float(e.pivot), 2),
                      "type": str(e.type)}
                     for e in list(_breakout_rows(symbol, ev))[-days:]]

    return {"symbol": symbol, "benchmark_source": bench_src, "tf": tf,
            "candles": candles, **mas,
            "pivot": pivot, "stop": stop,
            "stage": stage, "rs": rs,
            "tt": tt, "breakouts": breakouts}


def _breakout_rows(symbol: str, ev):
    """Breakout events for one symbol as attribute objects.

    scan.analyze_symbol returns a LIST OF DICTS for a single stock (run_all
    builds the DataFrame); both shapes are accepted.
    """
    from types import SimpleNamespace
    if hasattr(ev, "columns"):
        rows = ev[ev.symbol == symbol].to_dict("records") if len(ev) else []
    else:
        rows = list(ev or [])
    return [SimpleNamespace(**r) for r in rows if r.get("pivot") == r.get("pivot")]
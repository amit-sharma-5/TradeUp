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


def build_chart(symbol: str, days: int = 400) -> dict:
    """JSON-ready chart payload for one symbol."""
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

    d = df.tail(days)
    candles = [{"date": str(ix.date()), "open": round(r.open, 2), "high": round(r.high, 2),
                "low": round(r.low, 2), "close": round(r.close, 2),
                "volume": int(r.volume)} for ix, r in d.iterrows()]
    ma = lambda col: ([{"date": str(ix.date()), "value": round(float(v), 2)}
                       for ix, v in feats[col].tail(days).items() if v == v]
                      if feats is not None else [])

    # ev is a DataFrame when the stock has breakouts, an empty list otherwise
    ev_sym = ev[ev.symbol == symbol] if hasattr(ev, "columns") else []
    breakouts = [{"date": str(getattr(e, "date").date()), "price": round(float(e.pivot), 2),
                  "type": str(e.type)}
                 for e in list(ev_sym)[-days:]]

    return {"symbol": symbol, "benchmark_source": bench_src,
            "candles": candles,
            "ma50": ma("ma50"), "ma200": ma("ma200"),
            "pivot": pivot, "stop": stop,
            "stage": stage, "rs": rs,
            "tt": tt, "breakouts": breakouts}
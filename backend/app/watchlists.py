"""The screener's full output beyond the three action lists.

sepa/screener.screen() already computes Uptrend (no base), Leaders, Sell-Avoid,
Earnings × Tech (when StockEdge data exists) and Market context — the adapter
keeps the last screen's output, this module just makes it JSON-safe for the UI.
"""
import math
from datetime import date, datetime

import pandas as pd

# lists to expose and how many rows each may carry (keep the payload light)
_LISTS = {"Uptrend (no base)": 60, "Leaders": 60, "Sell-Avoid": 60, "Earnings x Tech": 100}


def _j(v):
    if v is None:
        return None
    if isinstance(v, (pd.Timestamp,)):
        return str(v.date())
    if isinstance(v, (date, datetime)):
        return str(v)
    if isinstance(v, float) and not math.isfinite(v):
        return None
    try:
        import numpy as np
        if isinstance(v, np.floating):
            return None if not math.isfinite(v) else float(v)
        if isinstance(v, np.integer):
            return int(v)
        if isinstance(v, np.bool_):
            return bool(v)
    except ImportError:
        pass
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def from_screen(asof: str, out: dict) -> dict:
    """JSON payload for /api/watchlists from one screener output dict."""
    lists = {}
    for label, cap in _LISTS.items():
        df = out.get(label)
        if df is None:
            lists[label] = []
            continue
        rows = [{k: _j(v) for k, v in r.items()} for r in df.to_dict("records")]
        lists[label] = rows[:cap]
    market = out.get("Market")
    lists["Market"] = _df_rows(market) if isinstance(market, pd.DataFrame) else (
        [{k: _j(v) for k, v in market.items()}] if isinstance(market, dict) else [])
    return {"asof": asof, **lists}


def _df_rows(df):
    return [{k: _j(v) for k, v in r.items()} for r in df.to_dict("records")] if len(df) else []
"""Sectors: NIFTY 500 grouped by industry — performance, breadth, stage/TT share.

Computed from the same per-stock feature frames the screener uses (no extra
price reads), so the numbers always match the scan. Performance is the median
session-return of the industry's members over 1D/1W/1M/3M/1Y; breadth is the
share above their 50-DMA; then Stage-2 / Trend-Template / active-setup shares.
"""
import pandas as pd

from .watchlists import _j

PERIODS = {"1D": 1, "1W": 5, "1M": 21, "3M": 63, "1Y": 252}


def from_feats(feats: dict, industry: dict[str, str]) -> list[dict]:
    groups: dict[str, list] = {}
    for sym, f in (feats or {}).items():
        ind = industry.get(sym)
        if not ind or f is None or len(f) < 2:
            continue
        c = f["close"]
        ma50 = f["ma50"].iloc[-1] if "ma50" in f else None
        rets = {name: float((c.iloc[-1] / c.iloc[-1 - n] - 1) * 100)
                for name, n in PERIODS.items() if len(c) > n + 1}
        groups.setdefault(ind, []).append({
            "rets": rets,
            "above50": bool(ma50 == ma50 and c.iloc[-1] > ma50),
            "stage2": int(f["stage"].iloc[-1]) == 2,
            "tt": bool(f["tt"].iloc[-1]) if "tt" in f else False,
            "setup": bool(f["setup"].iloc[-1]) if "setup" in f else False,
        })

    rows = []
    for ind, members in groups.items():
        row: dict = {"industry": ind, "stocks": len(members)}
        for name in PERIODS:
            vals = [m["rets"][name] for m in members if name in m["rets"]]
            row[name] = round(float(pd.Series(vals).median()), 1) if vals else None
        row["above50%"] = round(100 * sum(m["above50"] for m in members) / len(members), 1)
        row["stage2%"] = round(100 * sum(m["stage2"] for m in members) / len(members), 1)
        row["tt%"] = round(100 * sum(m["tt"] for m in members) / len(members), 1)
        row["setup%"] = round(100 * sum(m["setup"] for m in members) / len(members), 1)
        rows.append(row)
    rows.sort(key=lambda r: (r["1D"] is None, -(r["1D"] or 0)))
    return [{k: _j(v) for k, v in r.items()} for r in rows]
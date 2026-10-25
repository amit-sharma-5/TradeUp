"""Sectors: NIFTY 500 grouped by industry — performance, breadth, stage/TT share.

Computed from the same per-stock feature frames the screener uses (no extra
price reads), so the numbers always match the scan. Performance is the median
return of the industry's members over 1D/1W/1M/3M/1Y/5Y; breadth is the share
above their 50-DMA; then Stage-2 / Trend-Template / active-setup shares. Each
industry also carries its members so the UI can drill in.
"""
import pandas as pd

from .watchlists import _j

PERIODS = {"1D": 1, "1W": 5, "1M": 21, "3M": 63, "1Y": 252, "5Y": 1260}


def _member(sym: str, f) -> dict | None:
    if f is None or len(f) < 2:
        return None
    c = f["close"]
    ma50 = f["ma50"].iloc[-1] if "ma50" in f else float("nan")
    rets = {name: float((c.iloc[-1] / c.iloc[-1 - n] - 1) * 100)
            for name, n in PERIODS.items() if len(c) > n + 1}
    stage = f["stage"].iloc[-1] if "stage" in f else float("nan")
    setup = f["setup"].iloc[-1] if "setup" in f else ""
    return {
        "symbol": sym,
        "close": float(c.iloc[-1]),
        "rets": rets,
        "above50": bool(ma50 == ma50 and c.iloc[-1] > ma50),
        "stage": int(stage) if stage == stage else None,
        "tt": bool(f["tt"].iloc[-1]) if "tt" in f else False,
        "setup": setup if isinstance(setup, str) and setup else "",
        "rs": float(f["rs"].iloc[-1]) if "rs" in f and f["rs"].iloc[-1] == f["rs"].iloc[-1] else None,
    }


def from_feats(feats: dict, industry: dict[str, str]) -> list[dict]:
    groups: dict[str, list] = {}
    for sym, f in (feats or {}).items():
        ind = industry.get(sym)
        m = _member(sym, f) if ind else None
        if m:
            groups.setdefault(ind, []).append(m)

    rows = []
    for ind, members in groups.items():
        n = len(members)
        row: dict = {"industry": ind, "stocks": n}
        for name in PERIODS:
            vals = [m["rets"][name] for m in members if name in m["rets"]]
            row[name] = round(float(pd.Series(vals).median()), 1) if vals else None
        row["above50%"] = round(100 * sum(m["above50"] for m in members) / n, 1)
        row["stage2%"] = round(100 * sum(m["stage"] == 2 for m in members) / n, 1)
        row["tt%"] = round(100 * sum(m["tt"] for m in members) / n, 1)
        row["setup%"] = round(100 * sum(bool(m["setup"]) for m in members) / n, 1)
        row["members"] = [
            {"symbol": m["symbol"], "close": round(m["close"], 2),
             "1D": round(m["rets"]["1D"], 1) if "1D" in m["rets"] else None,
             "1M": round(m["rets"]["1M"], 1) if "1M" in m["rets"] else None,
             "rs": round(m["rs"]) if m["rs"] is not None else None,
             "stage": m["stage"], "tt": m["tt"], "setup": m["setup"]}
            for m in sorted(members, key=lambda m: -(m["rs"] or 0))]
        rows.append(row)
    rows.sort(key=lambda r: (r["1D"] is None, -(r["1D"] or 0)))
    return [{k: (_j(v) if k != "members" else v) for k, v in r.items()} for r in rows]
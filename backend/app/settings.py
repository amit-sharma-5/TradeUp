"""Trader settings: equity, risk %, position caps — used by position sizing.

Kept in data/settings.json (as the ARCHITECTURE data plan intended). The sizing
math itself is NOT rewritten here: /api/ticket calls the engine's trading.plan
(the same rules the backtest used) with these values plugged in.
"""
import json
from pathlib import Path

from .config import DATA_DIR

_FILE = DATA_DIR / "settings.json"
_DEFAULTS = {"equity": 1000000.0, "risk_pct": 1.25, "max_pos_pct": 20.0,
             "auto_paper": False, "active_profile": "default"}
_TYPES = {"equity": float, "risk_pct": float, "max_pos_pct": float,
          "auto_paper": bool, "active_profile": str}


def get() -> dict:
    s = dict(_DEFAULTS)
    if _FILE.exists():
        try:
            s.update(json.loads(_FILE.read_text()))
        except Exception:
            pass
    return s


def put(updates: dict) -> dict:
    s = get()
    for k, kind in _TYPES.items():
        if k in updates and updates[k] is not None:
            v = updates[k]
            s[k] = kind(v) if kind is not str else str(v)
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, indent=2))
    tmp.replace(_FILE)                    # atomic, like the journal writes
    return s
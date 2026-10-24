"""Rule profiles: named versions of the rule parameters.

The trading rules themselves are imported and never rewritten (non-negotiable),
but the engine was designed with its thresholds as parameters (sepa/params.P):
stop %, chase %, minimum grade, position cap. A "profile" is a named set of
those parameters. The active profile drives the screener AND can be backtested,
so you can create v1 vs v2 and compare them on real history.
"""
import json
import re
from pathlib import Path

from .config import DATA_DIR

_FILE = DATA_DIR / "profiles.json"

# name -> (min, max) or allowed set; ranges keep profiles inside sane bounds
_LIMITS = {
    "stop_pct": (3.0, 15.0),
    "chase_pct": (0.5, 5.0),
    "max_pos": (1, 20),
    "min_grade": ("", "A", "A+"),
}
_NAME_OK = re.compile(r"^[A-Za-z0-9 _-]{1,30}$")


def list_profiles() -> list[dict]:
    data = _read()
    if "default" not in data:
        data["default"] = {}
        _write(data)
    return [{"name": n, **p} for n, p in sorted(data.items())]


def get(name: str) -> dict | None:
    return _read().get(name)


def save(name: str, params: dict) -> list[dict]:
    name = (name or "").strip()
    if not _NAME_OK.match(name):
        raise ValueError(f"invalid profile name: {name!r}")
    clean = {}
    for k, v in (params or {}).items():
        if v is None or k not in _LIMITS:
            continue
        lim = _LIMITS[k]
        if isinstance(lim, tuple) and isinstance(lim[0], (int, float)):
            v = float(v)
            if not (lim[0] <= v <= lim[1]):
                raise ValueError(f"{k} must be between {lim[0]} and {lim[1]}")
        else:
            v = str(v)
            if v not in lim:
                raise ValueError(f"{k} must be one of {lim}")
        clean[k] = int(v) if k == "max_pos" else v
    data = _read()
    data[name] = clean
    _write(data)
    return list_profiles()


def delete(name: str, active: str = "default") -> list[dict]:
    if name == "default":
        raise ValueError("the default profile cannot be deleted")
    if name == active:
        raise ValueError("deactivate this profile before deleting it")
    data = _read()
    data.pop(name, None)
    _write(data)
    return list_profiles()


def params_for(name: str) -> dict:
    """Validated engine-parameter overrides for a profile name."""
    p = get(name) or {}
    return {k: v for k, v in p.items() if k in _LIMITS}


def _read() -> dict:
    if not _FILE.exists():
        return {}
    try:
        return json.loads(_FILE.read_text())
    except Exception:
        return {}


def _write(data: dict):
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(_FILE)
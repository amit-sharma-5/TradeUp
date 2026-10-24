"""My Watchlist: the trader's personal list, separate from the engine's lists.

The screener lists are pure rule output and must stay that way (manually adding
stocks there would corrupt what the system says). This list is the human's:
stocks you are studying that the rules do not flag yet. Stored in
data/watchlist.json; prices come from the quote poller's cache when available,
else from the price store's last close.
"""
import json
import re
from pathlib import Path

from .config import DATA_DIR

_FILE = DATA_DIR / "watchlist.json"
_SYMBOL_OK = re.compile(r"^[A-Z0-9&-]{1,15}$")


def symbols() -> list[str]:
    if not _FILE.exists():
        return []
    try:
        data = json.loads(_FILE.read_text())
        return [s for s in data.get("symbols", []) if isinstance(s, str)]
    except Exception:
        return []


def add(symbol: str, price_store_symbols: set[str] | None = None) -> list[str]:
    sym = (symbol or "").upper().strip()
    if not _SYMBOL_OK.match(sym):
        raise ValueError(f"not a valid symbol: {symbol!r}")
    if price_store_symbols is not None and sym not in price_store_symbols:
        raise ValueError(f"{sym} is not in the price store — search from the NIFTY 500 list")
    cur = symbols()
    if sym not in cur:
        cur.append(sym)
        _write(cur)
    return cur


def remove(symbol: str) -> list[str]:
    sym = (symbol or "").upper().strip()
    cur = [s for s in symbols() if s != sym]
    _write(cur)
    return cur


def _write(syms: list[str]):
    _FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = _FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps({"symbols": syms}, indent=2))
    tmp.replace(_FILE)


def rows(cache_get=None, names: dict[str, str] | None = None) -> list[dict]:
    """Watchlist rows with price context: live quote when the poller has one,
    otherwise the last stored close; change is vs the previous close."""
    from sepa import store as sepa_store   # caller guarantees SEPA is available

    out = []
    for sym in symbols():
        ltp = prev = None
        try:
            df = sepa_store.load(sym)
            if len(df):
                prev = float(df["close"].iloc[-2]) if len(df) > 1 else None
                ltp = float(df["close"].iloc[-1])
        except FileNotFoundError:
            pass
        if cache_get and (q := cache_get(sym)) is not None:
            ltp = q                                   # poller's quote is fresher
        chg = round((ltp / prev - 1) * 100, 2) if ltp and prev else None
        out.append({"symbol": sym, "name": (names or {}).get(sym, sym),
                    "ltp": ltp, "change_pct": chg})
    return out
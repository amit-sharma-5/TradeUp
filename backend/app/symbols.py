"""Stock search: the NIFTY 500 member list with company names.

Reads the cached member list (sepa/universe.py, no network on the hot path),
so /api/symbols is fast enough to fetch once per page load; the frontend
filters client-side as you type.
"""
import sys

from . import config


def get_symbols() -> list[dict]:
    """[{symbol, name, industry}] for every NIFTY 500 member."""
    root = config.SEPA_ROOT
    if not (root / "sepa" / "universe.py").exists():
        raise FileNotFoundError(f"SEPA engine not found at {root}")
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    from sepa.universe import current_nifty500

    df = current_nifty500()                      # cached CSV; refresh=False default
    return [{"symbol": r["Symbol"], "name": r["Company Name"], "industry": r["Industry"]}
            for r in df.to_dict("records") if r["Series"] == "EQ"]
"""Stock search: the NIFTY 500 member list with company names.

Reads the cached member list (sepa/universe.py, no network on the hot path),
so /api/symbols is fast enough to fetch once per page load; the frontend
filters client-side as you type.
"""
import sys

from .config import SEPA_ROOT


def get_symbols() -> list[dict]:
    """[{symbol, name, industry}] for every NIFTY 500 member."""
    if not (SEPA_ROOT / "sepa" / "universe.py").exists():
        raise FileNotFoundError(f"SEPA engine not found at {SEPA_ROOT}")
    if str(SEPA_ROOT) not in sys.path:
        sys.path.insert(0, str(SEPA_ROOT))
    from sepa.universe import current_nifty500

    df = current_nifty500()                      # cached CSV; refresh=False default
    return [{"symbol": r["Symbol"], "name": r["Company Name"], "industry": r["Industry"]}
            for r in df.to_dict("records") if r["Series"] == "EQ"]
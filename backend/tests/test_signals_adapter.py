"""SEPA adapter: the row -> Signal mapping is a pure function, tested without
the engine. The full engine run is exercised only when SEPA_ROOT exists."""
import math

import pytest

from app.domain import Category
from app.signals.adapter import SepaUnavailable, SepaSignalSource, row_to_signal


def _row(**over):
    base = {"symbol": "PERSISTENT", "name": "Persistent Systems", "close": 5740.0,
            "pivot": 5605.0, "buy_pivot": 5605.0, "why": "Breakout 21 Oct, vol 1.6×, RS 94"}
    base.update(over)
    return base


def test_strong_buy_row_maps_all_fields():
    sig = row_to_signal(_row(), Category.STRONG_BUY, change_pct=2.1)
    assert (sig.symbol, sig.name, sig.category) == ("PERSISTENT", "Persistent Systems",
                                                    Category.STRONG_BUY)
    assert (sig.ltp, sig.pivot) == (5740.0, 5605.0)
    assert sig.stop == round(5605.0 * 0.93, 2)        # stop_pct 7 % below pivot (params.py)
    assert "Breakout" in sig.why


def test_watch_row_without_breakout_uses_base_pivot():
    sig = row_to_signal(_row(buy_pivot=math.nan), Category.WATCH, 0.0)
    assert sig.pivot == 5605.0                        # falls back to the base pivot


def test_row_without_usable_pivot_is_skipped():
    assert row_to_signal(_row(pivot=math.nan, buy_pivot=math.nan), Category.WATCH, 0.0) is None


def test_missing_name_falls_back_to_symbol():
    sig = row_to_signal(_row(name=None), Category.BUY, 0.0)
    assert sig.name == "PERSISTENT"


def test_missing_sepa_root_raises_cleanly(tmp_path):
    src = SepaSignalSource(tmp_path / "nowhere")
    with pytest.raises(SepaUnavailable):
        src.refresh()
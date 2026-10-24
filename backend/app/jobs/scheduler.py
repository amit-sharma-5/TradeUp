"""Daily job: refresh NIFTY 500 prices (Yahoo, incremental) then re-run the screen.

Phase 1 keeps this deliberately simple: one daemon thread that wakes every
JOB_CHECK_MINUTES and, once per day after SCAN_TIME, runs update + scan. No
APScheduler, no cron — the app is a single-machine personal tool. Phase 2 can
swap this for a real scheduler without touching the engine.
"""
import datetime as dt
import os
import threading
import time
import traceback

from ..config import SEPA_ROOT

CHECK_MINUTES = int(os.getenv("TRADEUP_JOB_CHECK_MINUTES", "15"))
# One or more scan+report times per day, e.g. TRADEUP_SCAN_TIMES="09:15,17:30"
# (morning + evening Telegram alerts). Default keeps the single evening run.
SCAN_TIMES = [t.strip() for t in os.getenv("TRADEUP_SCAN_TIMES", os.getenv("TRADEUP_SCAN_TIME", "17:30")).split(",") if t.strip()]


def _update_prices(symbols: list[str]):
    """Incremental Yahoo download into the SEPA price store (same files it reads)."""
    from sepa import yahoo_prices
    yahoo_prices.update(symbols)


def run_daily_job(adapter) -> dict:
    """Update prices for the NIFTY 500, then re-scan. Returns a small status dict."""
    from sepa.universe import current_nifty500     # also refreshes/validates the member list
    symbols = sorted(current_nifty500()["Symbol"].astype(str))
    _update_prices(symbols)
    before = _list_membership(adapter)
    signals = adapter.refresh()
    changes = _report_changes(before, _list_membership(adapter))
    from .notify import send
    if changes:
        send(f"📊 TradeUp scan {adapter.status['asof']}\n{changes}")
    return {"symbols": len(symbols), "candidates": len(signals), "asof": adapter.status["asof"]}


def _list_membership(adapter) -> dict:
    """symbol → list name, from the last screen (for the daily change report)."""
    out = adapter.last_screen()
    if not out:
        return {}
    asof, screen = out
    m = {}
    for label in ("Strong Buy", "Buy", "Watch"):
        df = screen.get(label)
        if df is not None and len(df) and "symbol" in df.columns:
            for s in df.symbol:
                m[str(s)] = label
    return m


def _report_changes(before: dict, after: dict) -> str:
    """Human Telegram summary: which stocks entered / left the action lists."""
    added = [f"➕ {s} → {v}" for s, v in after.items() if s not in before]
    removed = [f"➖ {s} (was {before[s]})" for s in before if s not in after]
    moved = [f"↕ {s}: {before[s]} → {after[s]}" for s in after
             if s in before and before[s] != after[s]]
    parts = []
    if added:
        parts.append("New: " + "; ".join(added))
    if moved:
        parts.append("Changed: " + "; ".join(moved))
    if removed:
        parts.append("Dropped: " + "; ".join(removed))
    return "\n".join(parts) or "No changes in Strong Buy / Buy / Watch."


class Scheduler:
    def __init__(self, adapter):
        self._adapter = adapter
        self._ran: dict[str, str] = {}  # scan_time -> date last completed
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True, name="daily-job")
            self._thread.start()

    def stop(self):
        self._stop.set()

    def status(self) -> dict:
        return {"scan_times": SCAN_TIMES, "last_run": max(self._ran.values(), default=""),
                "running": bool(self._thread and self._thread.is_alive())}

    def _loop(self):
        while not self._stop.wait(CHECK_MINUTES * 60):
            try:
                if not (SEPA_ROOT / "sepa").exists():
                    continue
                now = dt.datetime.now()
                for t in SCAN_TIMES:
                    if self._ran.get(t) == now.date().isoformat():
                        continue
                    hh, mm = map(int, t.split(":"))
                    if now.time() >= dt.time(hh, mm):
                        run_daily_job(self._adapter)
                        self._ran[t] = now.date().isoformat()
            except Exception:
                traceback.print_exc()   # keep the scheduler alive; the next slot retries
                time.sleep(60)
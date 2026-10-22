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
SCAN_TIME = os.getenv("TRADEUP_SCAN_TIME", "17:30")   # after NSE close (15:30 IST) + data settle


def _update_prices(symbols: list[str]):
    """Incremental Yahoo download into the SEPA price store (same files it reads)."""
    from sepa import yahoo_prices
    yahoo_prices.update(symbols)


def run_daily_job(adapter) -> dict:
    """Update prices for the NIFTY 500, then re-scan. Returns a small status dict."""
    from sepa.universe import current_nifty500     # also refreshes/validates the member list
    symbols = sorted(current_nifty500()["Symbol"].astype(str))
    _update_prices(symbols)
    signals = adapter.refresh()
    return {"symbols": len(symbols), "candidates": len(signals), "asof": adapter.status["asof"]}


class Scheduler:
    def __init__(self, adapter):
        self._adapter = adapter
        self._last_run: str = ""        # date the job last completed
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True, name="daily-job")
            self._thread.start()

    def stop(self):
        self._stop.set()

    def status(self) -> dict:
        return {"last_run": self._last_run, "scan_time": SCAN_TIME,
                "running": bool(self._thread and self._thread.is_alive())}

    def _loop(self):
        while not self._stop.wait(CHECK_MINUTES * 60):
            try:
                now = dt.datetime.now()
                hh, mm = map(int, SCAN_TIME.split(":"))
                due = now.time() >= dt.time(hh, mm)
                if due and self._last_run != now.date().isoformat() and (SEPA_ROOT / "sepa").exists():
                    run_daily_job(self._adapter)
                    self._last_run = now.date().isoformat()
            except Exception:
                traceback.print_exc()   # keep the scheduler alive; tomorrow's run retries
                time.sleep(60)
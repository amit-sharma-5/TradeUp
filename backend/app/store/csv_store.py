"""CSV persistence for the journal (ARCHITECTURE.md D3 + D5).

Two files in data/journal/:
  trades.csv  — current state of every trade (a read-model snapshot)
  events.csv  — append-only audit log; one row per TradeEvent, never edited

save_trade() appends only the events that are not yet on disk, then rewrites
the snapshot atomically (write-temp-then-rename). Reading replays what is on
disk, so a crash between the two writes loses at most the snapshot refresh,
never an event.
"""
import csv
import os
from pathlib import Path

from ..domain import Trade, TradeEvent, TradeStatus
from .base import Store

_TRADE_COLS = ["id", "symbol", "status", "qty", "order_kind", "trigger",
               "entry_price", "stop", "pivot", "exit_price", "exit_reason"]
_EVENT_COLS = ["trade_id", "ts", "event", "price", "qty", "reason"]


def _fmt(v) -> str:
    return "" if v is None else str(v)


def _num(s: str) -> float | None:
    return float(s) if s != "" else None


class CsvStore(Store):
    def __init__(self, journal_dir: Path):
        self._dir = Path(journal_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._trades: dict[str, Trade] = {}
        self._events_on_disk: dict[str, int] = {}   # trade_id -> events already persisted
        self._load()

    # ── loading: replay what is on disk ────────────────────────────────────
    def _load(self):
        trades_f, events_f = self._dir / "trades.csv", self._dir / "events.csv"
        if trades_f.exists():
            with open(trades_f, newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    t = Trade(
                        id=row["id"], symbol=row["symbol"],
                        status=TradeStatus(row["status"]), qty=int(row["qty"]),
                        order_kind=row["order_kind"] or "BUY_STOP",
                        trigger=_num(row["trigger"]), entry_price=_num(row["entry_price"]),
                        stop=_num(row["stop"]), pivot=_num(row["pivot"]),
                        exit_price=_num(row["exit_price"]), exit_reason=row["exit_reason"])
                    self._trades[t.id] = t
        if events_f.exists():
            with open(events_f, newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    t = self._trades.get(row["trade_id"])
                    if t is None:            # orphan event (should not happen) — keep it on disk, skip in memory
                        continue
                    t.events.append(TradeEvent(
                        ts=row["ts"], event=row["event"], price=_num(row["price"]),
                        qty=int(row["qty"]) if row["qty"] else None, reason=row["reason"]))
                    self._events_on_disk[row["trade_id"]] = \
                        self._events_on_disk.get(row["trade_id"], 0) + 1

    # ── Store interface ────────────────────────────────────────────────────
    def next_trade_id(self) -> str:
        n = max((int(t.id[1:]) for t in self._trades.values() if t.id.startswith("T")), default=0)
        return f"T{n + 1:04d}"

    def get_trade(self, trade_id: str) -> Trade | None:
        return self._trades.get(trade_id)

    def save_trade(self, trade: Trade) -> None:
        self._trades[trade.id] = trade
        self._append_new_events(trade)
        self._write_snapshot()

    def list_trades(self) -> list[Trade]:
        return list(self._trades.values())

    # ── writers ────────────────────────────────────────────────────────────
    def _append_new_events(self, trade: Trade):
        """Append the trade's not-yet-persisted events; the log is append-only."""
        start = self._events_on_disk.get(trade.id, 0)
        new = trade.events[start:]
        if not new:
            return
        with open(self._dir / "events.csv", "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            if fh.tell() == 0:
                w.writerow(_EVENT_COLS)
            for e in new:
                w.writerow([trade.id, e.ts, e.event, _fmt(e.price), _fmt(e.qty), e.reason])
            fh.flush()
            os.fsync(fh.fileno())
        self._events_on_disk[trade.id] = start + len(new)

    def _write_snapshot(self):
        """Rewrite trades.csv atomically: write a temp file, then rename over the old one."""
        tmp = self._dir / "trades.csv.tmp"
        with open(tmp, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(_TRADE_COLS)
            for t in sorted(self._trades.values(), key=lambda t: t.id):
                w.writerow([t.id, t.symbol, t.status.value, t.qty, t.order_kind,
                            _fmt(t.trigger), _fmt(t.entry_price), _fmt(t.stop),
                            _fmt(t.pivot), _fmt(t.exit_price), t.exit_reason])
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, self._dir / "trades.csv")
"""SQLite persistence — the Phase 2 Store implementation (ARCHITECTURE.md D3).

Same semantics as CsvStore: trades table is the current-state read model,
trade_events is append-only. Selected with TRADEUP_STORE=sqlite (CSV stays the
default — it is inspectable and the Phase 1 decision). No auto-migration from
CSV: point both at the same data only after the CSV journal is quiet.
"""
import csv
import sqlite3
import threading
from pathlib import Path

from ..domain import Trade, TradeEvent, TradeStatus
from .base import Store

_SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, status TEXT NOT NULL,
    qty INTEGER NOT NULL, order_kind TEXT NOT NULL DEFAULT 'BUY_STOP',
    trigger REAL, entry_price REAL, stop REAL, pivot REAL,
    exit_price REAL, exit_reason TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS trade_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,     -- append-only, never edited
    trade_id TEXT NOT NULL REFERENCES trades(id),
    ts TEXT NOT NULL, event TEXT NOT NULL, price REAL, qty INTEGER,
    reason TEXT NOT NULL DEFAULT '');
"""


class SqliteStore(Store):
    def __init__(self, db_path):
        db_path = Path(db_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._path = str(db_path)                 # remember for re-opening (tests)
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()
        self._lock = threading.Lock()             # SQLite + threads: serialize writes
        self._events_on_disk: dict[str, int] = self._count_events()

    def _count_events(self) -> dict[str, int]:
        rows = self._conn.execute(
            "SELECT trade_id, COUNT(*) n FROM trade_events GROUP BY trade_id")
        return {r["trade_id"]: r["n"] for r in rows}

    # ── Store interface ────────────────────────────────────────────────────
    def next_trade_id(self) -> str:
        row = self._conn.execute(
            "SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) m FROM trades").fetchone()
        return f"T{(row['m'] or 0) + 1:04d}"

    def get_trade(self, trade_id: str) -> Trade | None:
        row = self._conn.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
        return self._hydrate(row) if row else None

    def save_trade(self, trade: Trade) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO trades (id,symbol,status,qty,order_kind,trigger,"
                "entry_price,stop,pivot,exit_price,exit_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (trade.id, trade.symbol, trade.status.value, trade.qty, trade.order_kind,
                 trade.trigger, trade.entry_price, trade.stop, trade.pivot,
                 trade.exit_price, trade.exit_reason))
            start = self._events_on_disk.get(trade.id, 0)
            if len(trade.events) > start:          # append only the new events
                self._conn.executemany(
                    "INSERT INTO trade_events (trade_id,ts,event,price,qty,reason) "
                    "VALUES (?,?,?,?,?,?)",
                    [(trade.id, e.ts, e.event, e.price, e.qty, e.reason)
                     for e in trade.events[start:]])
                self._events_on_disk[trade.id] = len(trade.events)
            self._conn.commit()

    def list_trades(self) -> list[Trade]:
        return [self._hydrate(r) for r in
                self._conn.execute("SELECT * FROM trades ORDER BY id")]

    # ── helpers ────────────────────────────────────────────────────────────
    def import_from_csv(self, journal_dir: Path) -> int:
        """One-time import of an existing CSV journal (TRADEUP_STORE=sqlite switch).
        Only runs when the database is empty, so it can never duplicate data."""
        journal_dir = Path(journal_dir)
        if self._conn.execute("SELECT COUNT(*) c FROM trades").fetchone()["c"]:
            return 0
        trades_f, events_f = journal_dir / "trades.csv", journal_dir / "events.csv"
        if not trades_f.exists():
            return 0
        with open(trades_f, newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                self._conn.execute(
                    "INSERT INTO trades (id,symbol,status,qty,order_kind,trigger,"
                    "entry_price,stop,pivot,exit_price,exit_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (row["id"], row["symbol"], row["status"], int(row["qty"]),
                     row["order_kind"] or "BUY_STOP",
                     float(row["trigger"]) if row["trigger"] else None,
                     float(row["entry_price"]) if row["entry_price"] else None,
                     float(row["stop"]) if row["stop"] else None,
                     float(row["pivot"]) if row["pivot"] else None,
                     float(row["exit_price"]) if row["exit_price"] else None,
                     row["exit_reason"]))
        n = 0
        if events_f.exists():
            with open(events_f, newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    if row["trade_id"] not in {r["id"] for r in
                                               self._conn.execute("SELECT id FROM trades")}:
                        continue               # skip orphans, same as CsvStore
                    self._conn.execute(
                        "INSERT INTO trade_events (trade_id,ts,event,price,qty,reason) "
                        "VALUES (?,?,?,?,?,?)",
                        (row["trade_id"], row["ts"], row["event"],
                         float(row["price"]) if row["price"] else None,
                         int(row["qty"]) if row["qty"] else None, row["reason"]))
                    n += 1
        self._conn.commit()
        self._events_on_disk = self._count_events()
        print(f"sqlite: imported {self._count()} trade(s), {n} event(s) from {journal_dir}")
        return n

    def _count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) c FROM trades").fetchone()["c"]
    def _hydrate(self, row: sqlite3.Row) -> Trade:
        events = [TradeEvent(ts=r["ts"], event=r["event"], price=r["price"],
                             qty=r["qty"], reason=r["reason"])
                  for r in self._conn.execute(
                      "SELECT * FROM trade_events WHERE trade_id=? ORDER BY seq",
                      (row["id"],))]
        return Trade(id=row["id"], symbol=row["symbol"],
                     status=TradeStatus(row["status"]), qty=row["qty"],
                     order_kind=row["order_kind"], trigger=row["trigger"],
                     entry_price=row["entry_price"], stop=row["stop"],
                     pivot=row["pivot"], exit_price=row["exit_price"],
                     exit_reason=row["exit_reason"], events=events)
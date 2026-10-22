"""TradeUp backend — Phase 1 MVP.

    uvicorn app.main:app --reload --port 8000   (from backend/)

In-memory stores seeded with mock data so the frontend can be built before the
real signal source and CSV store land. The Broker/Store/SignalSource seams below
are where the real implementations plug in (docs/ARCHITECTURE.md §3).
"""
import itertools
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TradeUp", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ── domain ────────────────────────────────────────────────────────────────
class Category(str, Enum):
    STRONG_BUY = "Strong Buy"
    BUY = "Buy"
    WATCH = "Watch"


@dataclass
class Signal:
    symbol: str
    name: str
    category: Category
    ltp: float
    change_pct: float
    pivot: float
    stop: float
    why: str


@dataclass
class TradeEvent:
    ts: str
    event: str          # order_placed | filled | cancelled | stopped_out | exited
    price: Optional[float]
    qty: Optional[int]
    reason: str = ""


@dataclass
class Trade:
    id: str
    symbol: str
    status: str         # PLANNED | OPEN | CLOSED | CANCELLED
    qty: int
    entry_price: Optional[float] = None
    stop: Optional[float] = None
    exit_price: Optional[float] = None
    exit_reason: str = ""
    events: list[TradeEvent] = field(default_factory=list)


# ── mock signal source (replaced by the SEPA engine adapter) ──────────────
MOCK_SIGNALS = [
    Signal("CRAFTSMAN", "Craftsman Automation", Category.WATCH, 11002.0, 1.2, 11353.0, 10250.0,
           "Strong uptrend, forming a handle; buy on a breakout above ₹11,353 with volume"),
    Signal("PERSISTENT", "Persistent Systems", Category.STRONG_BUY, 5740.0, 2.1, 5605.0, 5210.0,
           "Broke out of a 7-week flat base today with 1.6x volume; RS 94; EPS accelerating"),
    Signal("DIXON", "Dixon Technologies", Category.BUY, 14210.0, 0.8, 13980.0, 13010.0,
           "Cup-with-handle buy point ₹13,980; price just re-entered the buy zone"),
]

_signals: list[Signal] = MOCK_SIGNALS
_trades: dict[str, Trade] = {}
_ids = itertools.count(1)


# ── API ───────────────────────────────────────────────────────────────────
class OrderIn(BaseModel):
    symbol: str
    kind: str = "BUY_STOP"      # BUY_STOP | LIMIT
    qty: int
    limit_price: float
    stop: float


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


@app.get("/api/health")
def health():
    return {"ok": True, "phase": "mock", "trades": len(_trades)}


@app.get("/api/candidates")
def candidates():
    return [{"symbol": s.symbol, "name": s.name, "category": s.category.value,
             "ltp": s.ltp, "change_pct": s.change_pct, "pivot": s.pivot,
             "buy_zone_low": s.pivot, "buy_zone_high": round(s.pivot * 1.02, 2),
             "stop": s.stop, "why": s.why} for s in _signals]


@app.post("/api/orders")
def place_order(o: OrderIn):
    sig = next((s for s in _signals if s.symbol == o.symbol.upper()), None)
    if sig is None:
        raise HTTPException(404, f"unknown symbol {o.symbol}")
    if o.qty <= 0 or o.limit_price <= 0 or o.stop <= 0 or o.stop >= o.limit_price:
        raise HTTPException(422, "qty/limit/stop invalid (stop must be below entry)")
    tid = f"T{next(_ids):04d}"
    t = Trade(id=tid, symbol=sig.symbol, status="PLANNED", qty=o.qty,
              stop=o.stop)
    t.events.append(TradeEvent(_now(), "order_placed", o.limit_price, o.qty,
                               f"{o.kind} @ {o.limit_price}, stop {o.stop}"))
    _trades[tid] = t
    return {"trade_id": tid, "status": t.status}


@app.get("/api/journal")
def journal():
    def t2d(t: Trade):
        return {"id": t.id, "symbol": t.symbol, "status": t.status, "qty": t.qty,
                "entry_price": t.entry_price, "stop": t.stop, "exit_price": t.exit_price,
                "exit_reason": t.exit_reason,
                "events": [{"ts": e.ts, "event": e.event, "price": e.price,
                            "qty": e.qty, "reason": e.reason} for e in t.events]}
    return {"trades": [t2d(t) for t in _trades.values()]}
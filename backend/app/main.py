"""TradeUp backend — Phase 1 MVP.

    uvicorn app.main:app --reload --port 8000   (from backend/)

Thin API layer over the domain/broker/store/signals seams (docs/ARCHITECTURE.md
§3). The app factory keeps each test run isolated from the module-level app.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .broker.paper import PaperBroker
from .domain import Category, Signal, Trade
from .signals.mock import MockSignalSource
from .store.memory import InMemoryStore


def create_app() -> FastAPI:
    store = InMemoryStore()
    broker = PaperBroker(store)
    signals = MockSignalSource()

    app = FastAPI(title="TradeUp", version="0.1.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
                       allow_methods=["*"], allow_headers=["*"])

    class OrderIn(BaseModel):
        symbol: str
        kind: str = "BUY_STOP"      # BUY_STOP | LIMIT
        qty: int
        limit_price: float
        stop: float

    @app.get("/api/health")
    def health():
        return {"ok": True, "phase": "mock", "trades": len(store.list_trades())}

    @app.get("/api/candidates")
    def candidates():
        return [{"symbol": s.symbol, "name": s.name, "category": s.category.value,
                 "ltp": s.ltp, "change_pct": s.change_pct, "pivot": s.pivot,
                 "buy_zone_low": s.pivot, "buy_zone_high": round(s.pivot * 1.02, 2),
                 "stop": s.stop, "why": s.why} for s in signals.get_candidates()]

    def _signal_for(symbol: str) -> Signal:
        sig = next((s for s in signals.get_candidates()
                    if s.symbol == symbol.upper()), None)
        if sig is None:
            raise HTTPException(404, f"unknown symbol {symbol}")
        return sig

    @app.post("/api/orders", status_code=201)
    def place_order(o: OrderIn):
        sig = _signal_for(o.symbol)
        try:
            trade = broker.place(sig.symbol, o.kind, o.qty, o.limit_price,
                                 o.stop, pivot=sig.pivot)
        except ValueError as e:
            raise HTTPException(422, str(e))
        return {"trade_id": trade.id, "status": trade.status.value}

    @app.post("/api/orders/{trade_id}/cancel")
    def cancel_order(trade_id: str):
        try:
            trade = broker.cancel(trade_id)
        except KeyError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(409, str(e))
        return {"trade_id": trade.id, "status": trade.status.value}

    @app.get("/api/journal")
    def journal():
        return {"trades": [t.to_dict() for t in store.list_trades()]}

    return app


app = create_app()
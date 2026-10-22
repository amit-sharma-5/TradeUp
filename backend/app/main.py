"""TradeUp backend — Phase 1.

    uvicorn app.main:app --reload --port 8000   (from backend/)

Thin API layer over the domain/broker/store/signals seams (docs/ARCHITECTURE.md
§3). Storage is CSV (D3); signals come from the imported SEPA engine when its
repo is present (SEPA_ROOT), otherwise the mock source keeps the app usable.
"""
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import config
from . import auth
from .broker.paper import PaperBroker
from .domain import Signal
from .jobs.quote_poller import QuotePoller
from .jobs.scheduler import Scheduler, run_daily_job
from .signals.adapter import SepaSignalSource, SepaUnavailable
from .signals.mock import MockSignalSource
from .store.csv_store import CsvStore
from .store.sqlite_store import SqliteStore


def _make_store(journal_dir):
    """TRADEUP_STORE=sqlite swaps the implementation; the interface is unchanged (D3)."""
    if config.STORE_KIND == "sqlite":
        return SqliteStore(config.DATA_DIR / "journal.db")
    return CsvStore(journal_dir or config.JOURNAL_DIR)


def create_app(start_background: bool = True, journal_dir=None) -> FastAPI:
    store = _make_store(journal_dir)
    broker = PaperBroker(store)

    # Signals: the real SEPA engine when available, mock otherwise (CI, fresh clones).
    if (config.SEPA_ROOT / "sepa" / "scan.py").exists():
        signals: object = SepaSignalSource(config.SEPA_ROOT)
        source_name = "sepa"
    else:
        signals = MockSignalSource()
        source_name = "mock"

    app = FastAPI(title="TradeUp", version="0.3.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
                       allow_methods=["*"], allow_headers=["*"])
    scheduler = Scheduler(signals) if source_name == "sepa" else None
    poller = QuotePoller(broker, store) if source_name == "sepa" else None

    class OrderIn(BaseModel):
        symbol: str
        kind: str = "BUY_STOP"      # BUY_STOP | LIMIT
        qty: int
        limit_price: float
        stop: float

    class LoginIn(BaseModel):
        passphrase: str

    @app.post("/api/login")
    def login(body: LoginIn, response: Response):
        auth.issue_cookie(response, body.passphrase)
        return {"ok": True}

    @app.middleware("http")
    async def _auth_guard(request, call_next):
        """Phase 2 auth: active only when TRADEUP_PASSPHRASE is set. /api/login and
        /api/health stay open so the UI can tell the user what to do."""
        path = request.url.path
        if auth.enabled and path.startswith("/api") and path not in ("/api/login", "/api/health"):
            try:
                auth.verify(request)
            except HTTPException as e:
                return JSONResponse({"detail": e.detail}, status_code=e.status_code)
        return await call_next(request)

    @app.get("/api/health")
    def health():
        return {"ok": True, "signal_source": source_name, "store": config.STORE_KIND,
                "trades": len(store.list_trades()),
                "signals": signals.status if source_name == "sepa" else {"status": "mock, 3 candidates"},
                "scheduler": scheduler.status() if scheduler else {"running": False},
                "quote_poller": poller.status() if poller else {"running": False}}

    @app.get("/api/candidates")
    def candidates():
        """Strong Buy / Buy / Watch cards. If the SEPA scan has not run yet in this
        install, kick one off in the background (the first scan is slow)."""
        cands: list[Signal] = signals.get_candidates()
        if source_name == "sepa" and not cands:
            signals.refresh_async()
        return [{"symbol": s.symbol, "name": s.name, "category": s.category.value,
                 "ltp": s.ltp, "change_pct": s.change_pct, "pivot": s.pivot,
                 "buy_zone_low": s.pivot, "buy_zone_high": round(s.pivot * 1.02, 2),
                 "stop": s.stop, "why": s.why} for s in cands]

    @app.post("/api/signals/refresh")
    def refresh_signals():
        """Background re-scan; /api/health and /api/candidates pick up the result."""
        if source_name != "sepa":
            raise HTTPException(503, "signal source is mock (SEPA engine not configured)")
        started = signals.refresh_async()
        return {"started": started}

    @app.post("/api/signals/run-daily-job")
    def run_daily():
        """Manual trigger of the full daily job: Yahoo price update + scan (synchronous, slow)."""
        if source_name != "sepa":
            raise HTTPException(503, "signal source is mock (SEPA engine not configured)")
        try:
            return run_daily_job(signals)
        except SepaUnavailable as e:
            raise HTTPException(503, str(e))

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

    if start_background and scheduler:
        scheduler.start()
    if start_background and poller:
        poller.start()

    return app


app = create_app()
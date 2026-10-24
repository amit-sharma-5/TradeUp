"""TradeUp backend — Phase 1.

    uvicorn app.main:app --reload --port 8000   (from backend/)

Thin API layer over the domain/broker/store/signals seams (docs/ARCHITECTURE.md
§3). Storage is CSV (D3); signals come from the imported SEPA engine when its
repo is present (SEPA_ROOT), otherwise the mock source keeps the app usable.
"""
import sys

from fastapi import FastAPI, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from . import config
from . import auth
from . import settings as app_settings
from .backtester import Backtester
from .broker.paper import PaperBroker
from .chartdata import build_chart
from .stockedge_admin import save_upload, status as stockedge_status
from .symbols import get_symbols
from .ticket import plan_for
from .watchlists import from_screen as watchlists_from_screen
from . import watchlist
from .symbols import get_symbols
from .domain import Category, Signal, TradeStatus
from .jobs.notify import send as notify_send
from .jobs.quote_poller import PriceCache, QuotePoller
from .jobs.scheduler import Scheduler, run_daily_job
from .signals.adapter import SepaSignalSource, SepaUnavailable
from .signals.mock import MockSignalSource
from .store.csv_store import CsvStore
from .store.sqlite_store import SqliteStore


def _make_store(journal_dir):
    """TRADEUP_STORE=sqlite swaps the implementation; the interface is unchanged (D3).
    A one-time CSV import happens when switching on an empty database."""
    if config.STORE_KIND == "sqlite":
        s = SqliteStore(config.DATA_DIR / "journal.db")
        s.import_from_csv(journal_dir or config.JOURNAL_DIR)
        return s
    return CsvStore(journal_dir or config.JOURNAL_DIR)


def create_app(start_background: bool = True, journal_dir=None,
               price_cache: "PriceCache | None" = None) -> FastAPI:
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
    prices = PriceCache()
    poller = (QuotePoller(broker, store, price_cache=prices, notify=notify_send,
                          extra_symbols=watchlist.symbols)
              if source_name == "sepa" else None)
    backtester = Backtester()
    app.state.store, app.state.broker, app.state.prices = store, broker, prices
    app.state.signals = signals

    class OrderIn(BaseModel):
        symbol: str
        kind: str = "BUY_STOP"      # BUY_STOP | LIMIT
        qty: int
        limit_price: float
        stop: float

    class LoginIn(BaseModel):
        passphrase: str

    class StopIn(BaseModel):
        stop: float

    class ExitIn(BaseModel):
        price: float
        reason: str = "sold (paper)"

    class NoteIn(BaseModel):
        note: str

    class SettingsIn(BaseModel):
        equity: float | None = None
        risk_pct: float | None = None
        max_pos_pct: float | None = None

    class WatchAddIn(BaseModel):
        symbol: str

    class BacktestIn(BaseModel):
        start: str = "2012-01-01"
        stop_pct: float | None = None
        chase_pct: float | None = None
        max_pos: int = 8
        grade: str | None = None

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
        """Today's screener entry if there is one; otherwise any NIFTY 500 stock
        from the price store (manual paper trades are part of the practice loop)."""
        sig = next((s for s in signals.get_candidates()
                    if s.symbol == symbol.upper()), None)
        if sig is not None:
            return sig
        try:
            c = build_chart(symbol.upper())
        except FileNotFoundError:
            raise HTTPException(404, f"unknown symbol {symbol}")
        last = c["candles"][-1]["close"] if c["candles"] else 0.0
        return Signal(symbol=c["symbol"], name=c["symbol"], category=Category.WATCH,
                      ltp=last, change_pct=0.0, pivot=c["pivot"] or last,
                      stop=c["stop"] or round(last * 0.93, 2),
                      why="Manual paper trade from chart (not in today's screener)")

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

    @app.post("/api/orders/{trade_id}/stop")
    def move_stop(trade_id: str, body: StopIn):
        try:
            trade = broker.modify_stop(trade_id, body.stop)
        except KeyError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(422, str(e))
        return {"trade_id": trade.id, "status": trade.status.value, "stop": trade.stop}

    @app.post("/api/orders/{trade_id}/exit")
    def record_exit(trade_id: str, body: ExitIn):
        try:
            trade = broker.exit(trade_id, body.price, body.reason)
        except KeyError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(422, str(e))
        return {"trade_id": trade.id, "status": trade.status.value,
                "exit_price": trade.exit_price}

    @app.patch("/api/journal/{trade_id}")
    def edit_note(trade_id: str, body: NoteIn):
        try:
            trade = broker.set_note(trade_id, body.note)
        except KeyError as e:
            raise HTTPException(404, str(e))
        return {"trade_id": trade.id, "note": trade.note}

    @app.get("/api/symbols")
    def symbols():
        """NIFTY 500 members with names, for client-side stock search."""
        if source_name != "sepa":
            raise HTTPException(503, "stock search needs the SEPA price store")
        return get_symbols()

    @app.get("/api/watchlists")
    def watchlists():
        """Everything the screener computed beyond the 3 action lists:
        Uptrend (no base), Leaders, Sell-Avoid, Earnings × Tech, Market context."""
        if source_name != "sepa":
            raise HTTPException(503, "watchlists need the SEPA engine")
        out = signals.last_screen()
        if out is None:
            signals.refresh_async()
            return {"asof": "", "stale": True}
        return watchlists_from_screen(*out)

    @app.get("/api/watchlist")
    def get_watchlist():
        """My Watchlist: the trader's personal list with live prices (the quote
        poller refreshes these every cycle)."""
        if source_name != "sepa":
            raise HTTPException(503, "watchlist needs the SEPA engine")
        try:
            names = {s["symbol"]: s["name"] for s in get_symbols()}
        except Exception:
            names = {}
        return {"symbols": watchlist.rows(cache_get=prices.get, names=names)}

    @app.post("/api/watchlist")
    def add_to_watchlist(body: WatchAddIn):
        if source_name != "sepa":
            raise HTTPException(503, "watchlist needs the SEPA engine")
        try:
            store_syms = {s["symbol"] for s in get_symbols()}
            watchlist.add(body.symbol, price_store_symbols=store_syms)
        except ValueError as e:
            raise HTTPException(422, str(e))
        return {"symbols": watchlist.symbols()}

    @app.delete("/api/watchlist/{symbol}")
    def remove_from_watchlist(symbol: str):
        return {"symbols": watchlist.remove(symbol)}

    @app.get("/api/settings")
    def get_settings():
        return app_settings.get()

    @app.put("/api/settings")
    def put_settings(body: SettingsIn):
        return app_settings.put(body.dict(exclude_none=True))

    @app.get("/api/ticket/{symbol}")
    def ticket(symbol: str, entry: float | None = None, stop: float | None = None,
               equity: float | None = None):
        """Position sizing per the engine's rules: qty from risk % and entry-stop
        distance, capped by max position %, plus chase-limit warnings."""
        if source_name != "sepa":
            raise HTTPException(503, "ticket sizing needs the SEPA engine")
        try:
            return plan_for(symbol, entry=entry, stop=stop, equity=equity)
        except FileNotFoundError:
            raise HTTPException(404, f"no price data for {symbol}")

    @app.get("/api/stockedge")
    def stockedge():
        """Status of the StockEdge fundamentals exports the screener uses."""
        if source_name != "sepa":
            raise HTTPException(503, "StockEdge needs the SEPA engine")
        try:
            if str(config.SEPA_ROOT) not in sys.path:
                sys.path.insert(0, str(config.SEPA_ROOT))
            return stockedge_status()
        except Exception as e:
            return {"files": [], "latest": {"error": str(e)}}

    @app.post("/api/stockedge/upload")
    def stockedge_upload(file: UploadFile):
        """Save a StockEdge scan export where the engine reads it, then rescan."""
        if source_name != "sepa":
            raise HTTPException(503, "StockEdge needs the SEPA engine")
        try:
            content = file.file.read()
            name = save_upload(file.filename or "", content)
        except ValueError as e:
            raise HTTPException(422, str(e))
        started = signals.refresh_async()
        return {"saved": name, "refresh_started": started,
                "note": "rescan started — candidates and watchlists update in a minute"}

    @app.get("/api/news/{symbol}")
    def news(symbol: str):
        """Headlines naming the company (Google News RSS via the engine, trusted
        newsrooms only). Fetched live — a slow call; failures degrade to empty."""
        if source_name != "sepa":
            raise HTTPException(503, "news needs the SEPA engine")
        try:
            if str(config.SEPA_ROOT) not in sys.path:
                sys.path.insert(0, str(config.SEPA_ROOT))
            from sepa import news as sepa_news
            df = sepa_news.fetch(symbol)
            return [{"date": str(r.date), "source": r.source, "title": r.title,
                     "link": r.link, "tags": r.tags} for r in df.itertuples()]
        except Exception as e:
            return {"error": f"news unavailable: {e}"}

    @app.get("/api/journal.csv")
    def journal_csv():
        """The journal as CSV (Excel-friendly) — your data, exportable anytime."""
        import csv as _csv
        import io
        trades = store.list_trades()
        buf = io.StringIO()
        w = _csv.writer(buf)
        cols = ["id", "symbol", "status", "qty", "order_kind", "trigger", "entry_price",
                "stop", "exit_price", "exit_reason", "note"]
        w.writerow(cols)
        for t in trades:
            d = t.to_dict()
            w.writerow([d[c] if d[c] is not None else "" for c in cols])
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename=tradeup_journal_{_today()}.csv"})

    @app.get("/api/chart/{symbol}")
    def chart(symbol: str, days: int = 400, tf: str = "daily"):
        """OHLCV + MAs + pivot/stop + breakout marks for the chart page.
        tf: daily (default, MA50/200) or weekly (resampled, 10/30/40-week MAs)."""
        if source_name != "sepa":
            raise HTTPException(503, "charts need the SEPA price store (mock source is active)")
        if tf not in ("daily", "weekly"):
            raise HTTPException(422, "tf must be daily or weekly")
        try:
            return build_chart(symbol, days, tf)
        except FileNotFoundError as e:
            raise HTTPException(404, f"no price data for {symbol}")

    @app.post("/api/backtest")
    def run_backtest(body: BacktestIn):
        """Starts the SEPA backtest in the background (seconds warm, minutes cold).
        Poll GET /api/backtest for the result."""
        if source_name != "sepa":
            raise HTTPException(503, "backtest needs the SEPA engine (mock source is active)")
        started = backtester.run_async(start=body.start, stop_pct=body.stop_pct,
                                       chase_pct=body.chase_pct,
                                       max_pos=body.max_pos, grade=body.grade or None)
        return {"started": started, **backtester.status}

    @app.get("/api/backtest")
    def backtest_result():
        return {**backtester.status, "result": backtester.result()}

    @app.get("/api/journal")
    def journal():
        """The story of every trade, plus derived P&L where it is knowable:
        unrealized for OPEN trades (from the poller's last known price) and
        realized for CLOSED ones."""
        out = []
        for t in store.list_trades():
            d = t.to_dict()
            if t.status is TradeStatus.OPEN and t.entry_price is not None:
                last = prices.get(t.symbol)
                if last is not None:
                    d["last_price"] = last
                    d["unrealized_pnl"] = round((last - t.entry_price) * t.qty, 2)
                    d["unrealized_pnl_pct"] = round((last / t.entry_price - 1) * 100, 2)
            if t.status is TradeStatus.CLOSED and t.entry_price and t.exit_price:
                d["pnl"] = round((t.exit_price - t.entry_price) * t.qty, 2)
                d["pnl_pct"] = round((t.exit_price / t.entry_price - 1) * 100, 2)
            out.append(d)
        return {"trades": out}

    if start_background and scheduler:
        scheduler.start()
    if start_background and poller:
        poller.start()

    # Serve the built frontend (frontend/dist) so the whole app is ONE process
    # on ONE port — that's what the one-click start scripts rely on. In dev,
    # Vite keeps proxying /api to :8000 and this mount is simply unused.
    dist = config.REPO_ROOT / "frontend" / "dist"
    if dist.exists():
        from fastapi.staticfiles import StaticFiles
        app.mount("/", StaticFiles(directory=str(dist), html=True), name="frontend")

    return app


app = create_app()


def _today() -> str:
    import datetime
    return datetime.date.today().isoformat()
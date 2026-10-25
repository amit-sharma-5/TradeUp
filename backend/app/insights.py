"""Stock detail + holdings review + TTLC stats — the engine's own verdicts.

Mirrors the SEPA terminal's per-stock panel (SEPA status, trade plan,
breakouts & violations, fundamentals, my trades) and its Journal/Holdings
review. Nothing is re-derived by hand except the Trend Template checklist,
which recomputes the engine's seven price conditions (sepa/engine.py c1..c7)
from the same price file so each pass/fail can be shown individually.
"""
import math
import sys
from types import SimpleNamespace

from . import config


def _sepa():
    root = config.SEPA_ROOT
    if not (root / "sepa" / "engine.py").exists():
        raise FileNotFoundError(f"SEPA engine not found at {root}")
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _initial_stop(t):
    """The stop the trade was planned with (risk = entry - initial stop, as
    the engine defines R). Recorded in the order_placed event reason."""
    for e in t.events:
        if e.event == "order_placed" and "stop " in (e.reason or ""):
            try:
                return float(e.reason.rsplit("stop ", 1)[-1].split()[0].rstrip(","))
            except ValueError:
                break
    return t.stop


def _f(v, d=2):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return round(v, d) if math.isfinite(v) else None


# ── Trend Template checklist (engine.py c1..c7 + RS) ──────────────────────
def tt_checklist(df, rs, p) -> list[dict]:
    c = df["close"]
    ma50, ma150, ma200 = (c.rolling(n).mean() for n in (50, 150, 200))
    if len(c) < 200 or ma200.isna().iloc[-1]:
        return [{"rule": "200 sessions of history", "ok": False,
                 "detail": "too little history for the full Trend Template"}]
    i = -1
    last, m50, m150, m200 = c.iloc[i], ma50.iloc[i], ma150.iloc[i], ma200.iloc[i]
    m200_then = ma200.iloc[i - p.slope_bars] if len(ma200) > p.slope_bars else float("nan")
    hi52, lo52 = c.iloc[-252:].max(), c.iloc[-252:].min()
    off_hi = (1 - last / hi52) * 100
    above_lo = (last / lo52 - 1) * 100
    rows = [
        ("Price above the 150- and 200-day", last > m150 and last > m200,
         f"close {last:,.2f} vs 150-d {m150:,.2f} / 200-d {m200:,.2f}"),
        ("150-day above the 200-day", m150 > m200, f"{m150:,.2f} vs {m200:,.2f}"),
        ("200-day trending up (1 month)", m200 > m200_then, f"{m200_then:,.2f} → {m200:,.2f}"),
        ("50-day above the 150- and 200-day", m50 > m150 and m50 > m200, f"50-d {m50:,.2f}"),
        ("Price above the 50-day", last > m50, f"{last:,.2f} vs {m50:,.2f}"),
        (f"At least {p.pct_above_low:g}% above the 52-week low", above_lo >= p.pct_above_low,
         f"{above_lo:.0f}% above {lo52:,.2f}"),
        (f"Within {p.pct_from_high:g}% of the 52-week high", off_hi <= p.pct_from_high,
         f"{off_hi:.0f}% below {hi52:,.2f}"),
    ]
    if rs is not None:
        rows.append((f"Relative strength ≥ {p.rs_min:g}", rs >= p.rs_min, f"RS {rs:.0f}"))
    return [{"rule": r, "ok": bool(ok), "detail": d} for r, ok, d in rows]


# ── stock detail ──────────────────────────────────────────────────────────
def stock_detail(symbol: str, store, settings: dict, last_screen=None) -> dict:
    _sepa()
    from sepa import scan, store as sepa_store, trading
    from sepa.params import DEFAULT

    symbol = symbol.upper()
    df = sepa_store.load(symbol)                    # FileNotFoundError when unknown
    bench, _ = sepa_store.benchmark()
    feats, ev = scan.analyze_symbol(symbol, bench, DEFAULT)
    if feats is None or not len(feats):
        raise FileNotFoundError(symbol)
    scan.attach_cross({symbol: feats}, DEFAULT)
    r = feats.iloc[-1]
    rs = _f(r.get("rs"), 0)

    # where the screener put it today (if anywhere)
    lists = []
    if last_screen:
        _asof, out = last_screen
        for k in ("Strong Buy", "Buy", "Watch", "Uptrend (no base)", "Leaders", "Sell-Avoid"):
            d = out.get(k)
            if d is not None and len(d) and "symbol" in d and symbol in set(d["symbol"]):
                lists.append("Algo Watch" if k == "Watch" else k)

    pivot = _f(r.get("pivot"))
    status = {
        "close": _f(r.close), "stage": int(r.stage) if r.stage == r.stage else None,
        "tt": bool(r.get("tt", False)), "rs": rs,
        "rs_line_new_high": bool(r.get("rs_nh", False)),
        "setup": r.setup if isinstance(r.get("setup"), str) and r.setup else None,
        "pivot": pivot, "off_high_pct": _f(r.get("pct_off_high"), 1),
        "ext50_pct": _f(r.get("ext50"), 1), "vol_x": _f(r.get("vol_x")),
        "turnover_cr": _f(r.get("turnover_cr"), 1),
        "base_count_stage2": int(r.s2_bases) if r.get("s2_bases") == r.get("s2_bases") else None,
        "lists": lists,
    }

    # trade plan with the trader's own sizing settings (engine rule)
    plan = None
    if pivot:
        s = {**trading.DEFAULTS, "equity": settings.get("equity", 1_000_000),
             "risk_pct": settings.get("risk_pct", trading.DEFAULTS["risk_pct"]),
             "max_pos_pct": settings.get("max_pos_pct", trading.DEFAULTS["max_pos_pct"])}
        plan = {k: (v if not isinstance(v, float) else _f(v))
                for k, v in trading.plan(pivot, s=s).items()}

    # breakout history (+ violations for recent ones)
    breakouts = []
    events = (ev[ev.symbol == symbol].to_dict("records") if hasattr(ev, "columns")
              else list(ev or []))                # analyze_symbol returns a list of dicts
    if events:
        from sepa.engine import post_breakout
        events = sorted(events, key=lambda e: e["date"])
        for e in events[-8:]:
            bars = len(df) - 1 - int(e.get("i", len(df) - 1))
            viol = []
            if 0 < bars <= DEFAULT.watch_bars:
                try:
                    viol = post_breakout(df, e, bars).get("violations", [])
                except Exception:
                    viol = []
            breakouts.append({
                "date": str(e["date"].date()), "type": str(e.get("type", "")),
                "pivot": _f(e.get("pivot")), "vol_x": _f(e.get("vol_x")),
                "base_no": int(e["base_no"]) if e.get("base_no") == e.get("base_no") else None,
                "since_pct": _f((df["close"].iloc[-1] / e["pivot"] - 1) * 100, 1) if e.get("pivot") else None,
                "violations": viol,
            })
        breakouts.reverse()

    # fundamentals from StockEdge when on file
    fundamentals = {}
    try:
        from sepa import stockedge
        se = stockedge.load()
        if len(se) and symbol in set(se.symbol):
            row = se[se.symbol == symbol].iloc[-1].to_dict()
            keep = ("results_qtr", "fund_score", "eps_ok", "accel", "pat_yoy_q0", "pat_yoy_q1",
                    "sales_yoy_q0", "sales_yoy_q1", "opm_q0", "opm_q4", "quality_warn",
                    "pledge_warn", "promoter_cut", "results_soon", "se_date")
            from .watchlists import _j
            fundamentals = {k: _j(v) for k, v in row.items() if k in keep}
            fundamentals = {k: (round(v, 1) if isinstance(v, float) else v)
                            for k, v in fundamentals.items() if v is not None}
    except Exception:
        fundamentals = {}

    my_trades = [t.to_dict() for t in store.list_trades() if t.symbol == symbol]

    return {"symbol": symbol, "status": status,
            "checklist": tt_checklist(df, rs, DEFAULT),
            "plan": plan, "breakouts": breakouts,
            "fundamentals": fundamentals, "my_trades": my_trades}


# ── holdings review (trading.position_actions) ────────────────────────────
def holdings_review(store, last_screen, last_feats, price_get=None) -> list[dict]:
    """Sell / Add more / Partial booking / Hold for every OPEN paper trade,
    using the engine's own position_actions (stage, TT, 50-day, big down day,
    climax, post-breakout violations, re-qualification, new base)."""
    _sepa()
    from sepa import trading
    from sepa.params import DEFAULT

    feats = last_feats or {}
    cats = last_screen[1] if last_screen else None
    rows = []
    for t in store.list_trades():
        if t.status.value != "OPEN" or t.entry_price is None:
            continue
        entry_ev = next((e for e in t.events if e.event == "filled"), None)
        entry_date = entry_ev.ts[:10] if entry_ev else None
        first_stop = _initial_stop(t)
        tt = SimpleNamespace(symbol=t.symbol, entry_price=t.entry_price, stop=t.stop,
                             stop_plan=first_stop, entry_date=entry_date,
                             rs_entry=float("nan"), fund_entry=float("nan"))
        if t.symbol not in feats:
            action, why = "?", "not in the last scan"
        else:
            try:
                action, why = trading.position_actions(tt, feats, DEFAULT, None, cats, None)
            except Exception as e:                       # never let one row kill the table
                action, why = "?", f"review failed: {e}"
        f = feats.get(t.symbol)
        last = (price_get(t.symbol) if price_get else None) or (
            float(f.close.iloc[-1]) if f is not None and len(f) else None)
        risk = t.entry_price - first_stop if first_stop else None
        rows.append({
            "id": t.id, "symbol": t.symbol, "action": action, "why": why,
            "entry": t.entry_price, "last": _f(last), "stop": t.stop, "qty": t.qty,
            "ret_pct": _f((last / t.entry_price - 1) * 100, 1) if last else None,
            "r_now": _f((last - t.entry_price) / risk, 2) if last and risk and risk > 0 else None,
            "pnl": _f((last - t.entry_price) * t.qty, 0) if last else None,
            "since": entry_date,
        })
    order = {"🔴 Sell": 0, "🟢 Add more": 1, "🟡 Partial booking": 2, "⚪ Hold": 3}
    rows.sort(key=lambda x: order.get(x["action"], 9))
    return rows


# ── TTLC statistics on closed trades ──────────────────────────────────────
def journal_stats(trades) -> dict:
    """Batting average, average gain/loss, gain/loss ratio, expectancy, avg R,
    total P&L — the same figures as sepa.trading.stats, on TradeUp's journal."""
    closed = []
    for t in trades:
        if t.status.value != "CLOSED" or not t.entry_price or not t.exit_price:
            continue
        ret = (t.exit_price / t.entry_price - 1) * 100
        first_stop = _initial_stop(t)
        risk = t.entry_price - first_stop if first_stop else None
        r = (t.exit_price - t.entry_price) / risk if risk and risk > 0 else None
        closed.append({"ret": ret, "r": r, "pnl": (t.exit_price - t.entry_price) * t.qty,
                       "auto": "auto" in (t.note or "")})
    if not closed:
        return {"closed_trades": 0}
    wins = [c for c in closed if c["ret"] > 0]
    losses = [c for c in closed if c["ret"] <= 0]
    avg_gain = sum(c["ret"] for c in wins) / len(wins) if wins else 0.0
    avg_loss = -sum(c["ret"] for c in losses) / len(losses) if losses else 0.0
    rs = [c["r"] for c in closed if c["r"] is not None]
    return {
        "closed_trades": len(closed),
        "win_pct": round(100 * len(wins) / len(closed), 1),
        "avg_gain_pct": round(avg_gain, 2),
        "avg_loss_pct": round(avg_loss, 2),
        "gain_loss_ratio": round(avg_gain / avg_loss, 2) if avg_loss else None,
        "expectancy_pct": round(sum(c["ret"] for c in closed) / len(closed), 2),
        "avg_r": round(sum(rs) / len(rs), 2) if rs else None,
        "total_pnl": round(sum(c["pnl"] for c in closed)),
        "auto_trades": sum(1 for c in closed if c["auto"]),
    }
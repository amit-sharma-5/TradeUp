"""Auth: one passphrase, signed session cookie (ARCHITECTURE.md §7, option 1).

Dormant by design: without TRADEUP_PASSPHRASE (env or backend/.env) localhost
stays open. Setting it puts every /api route except /api/health, /api/login
and /api/logout behind a cookie check — required before any non-localhost
exposure. Stdlib only: HMAC-signed, timestamped cookie, no session store.

Hardening: constant-time passphrase compare, per-client login throttling
(5 failures / 10 min), Secure cookie whenever the request arrived over HTTPS
(directly or via a reverse proxy's X-Forwarded-Proto).
"""
import hashlib
import hmac
import os
import threading
import time

from fastapi import HTTPException, Request, Response

COOKIE = "tu_session"
MAX_AGE_S = 30 * 24 * 3600
_secret = os.getenv("TRADEUP_PASSPHRASE", "")
enabled = bool(_secret)

_FAIL_WINDOW_S, _FAIL_MAX = 600, 5
_fails: dict[str, list[float]] = {}
_fails_lock = threading.Lock()


def _key() -> bytes:
    # derived on use, so changing the passphrase invalidates every old cookie
    return hashlib.sha256(("tu-v1:" + _secret).encode()).digest()


def _sign(payload: str) -> str:
    return hmac.new(_key(), payload.encode(), hashlib.sha256).hexdigest()


def _client(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "?")


def _throttled(who: str) -> bool:
    now = time.time()
    with _fails_lock:
        recent = [t for t in _fails.get(who, []) if now - t < _FAIL_WINDOW_S]
        _fails[who] = recent
        return len(recent) >= _FAIL_MAX


def _record_fail(who: str):
    with _fails_lock:
        _fails.setdefault(who, []).append(time.time())


def issue_cookie(request: Request, response: Response, passphrase: str):
    """Set the session cookie after a correct passphrase."""
    who = _client(request)
    if _throttled(who):
        raise HTTPException(429, "too many attempts — wait 10 minutes")
    if not enabled or not hmac.compare_digest((passphrase or "").encode(), _secret.encode()):
        _record_fail(who)
        raise HTTPException(401, "wrong passphrase")
    with _fails_lock:
        _fails.pop(who, None)
    https = (request.url.scheme == "https"
             or request.headers.get("x-forwarded-proto", "").lower() == "https")
    payload = str(int(time.time()))
    response.set_cookie(COOKIE, f"{payload}.{_sign(payload)}", max_age=MAX_AGE_S,
                        httponly=True, samesite="strict", secure=https, path="/")


def clear_cookie(response: Response):
    response.delete_cookie(COOKIE, path="/")


def is_authenticated(request: Request) -> bool:
    if not enabled:
        return True
    raw = request.cookies.get(COOKIE, "")
    payload, _, sig = raw.partition(".")
    if not payload or not hmac.compare_digest(_sign(payload), sig):
        return False
    try:
        age = time.time() - int(payload)
    except ValueError:
        return False
    return 0 <= age <= MAX_AGE_S


def verify(request: Request):
    """Raise 401 unless a fresh, correctly signed cookie is present."""
    if not is_authenticated(request):
        raise HTTPException(401, "login required")
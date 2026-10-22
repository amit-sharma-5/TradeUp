"""Auth, Phase 2 option 1 (ARCHITECTURE.md §7): one passphrase, signed session cookie.

Dormant by design: without TRADEUP_PASSPHRASE set, localhost stays open (Phase 1
decision). Setting it in backend/.env or the environment switches every /api
route (except login/health) behind a cookie check — required before any
non-localhost exposure. The cookie value is HMAC-signed and timestamped with
the stdlib only; no session store, no dependencies.
"""
import hashlib
import hmac
import os
import time

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse

COOKIE = "tu_session"
MAX_AGE_S = 30 * 24 * 3600
_secret = os.getenv("TRADEUP_PASSPHRASE", "")

enabled = bool(_secret)
_key = hashlib.sha256(("tu-v1:" + _secret).encode()).digest()


def _sign(payload: str) -> str:
    return hmac.new(_key, payload.encode(), hashlib.sha256).hexdigest()


def issue_cookie(response: Response, passphrase: str):
    """Set the session cookie after a correct passphrase (constant-time compare)."""
    if not enabled or not hmac.compare_digest(passphrase.encode(), _secret.encode()):
        raise HTTPException(401, "wrong passphrase")
    payload = str(int(time.time()))
    response.set_cookie(COOKIE, f"{payload}.{_sign(payload)}", max_age=MAX_AGE_S,
                        httponly=True, samesite="strict", secure=False, path="/")


def verify(request: Request):
    """Raise 401 unless a fresh, correctly signed cookie is present."""
    if not enabled:
        return
    raw = request.cookies.get(COOKIE, "")
    payload, _, sig = raw.partition(".")
    if not payload or not hmac.compare_digest(_sign(payload), sig):
        raise _unauthorized()
    try:
        age = time.time() - int(payload)
    except ValueError:
        raise _unauthorized()
    if age < 0 or age > MAX_AGE_S:
        raise _unauthorized()


def _unauthorized():
    return HTTPException(401, "login required")
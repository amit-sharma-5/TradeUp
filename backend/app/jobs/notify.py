"""Notifications (Phase 3): Telegram on fills / cancels / stop-outs.

Dormant by design, like auth: without TRADEUP_TELEGRAM_TOKEN and
TRADEUP_TELEGRAM_CHAT_ID set, send() is a no-op — no config file, no
dependency. The token lives in backend/.env only, never in code or git.
Delivery failures are swallowed (printed): a broken webhook must never
break the fill loop.
"""
import json
import os
import urllib.parse
import urllib.request

TOKEN = os.getenv("TRADEUP_TELEGRAM_TOKEN", "")
CHAT_ID = os.getenv("TRADEUP_TELEGRAM_CHAT_ID", "")
enabled = bool(TOKEN and CHAT_ID)


def send(text: str):
    if not enabled:
        return
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    body = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=10).read()
    except Exception as e:                      # noqa: BLE001 — notify is best-effort
        print(f"notify: telegram send failed: {e}")
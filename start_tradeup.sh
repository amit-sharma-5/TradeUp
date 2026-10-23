#!/bin/bash
# TradeUp — one-click start for macOS.
# Usage:  double-click Start TradeUp.command  (or run  ./start_tradeup.sh)
# Stops:  close the Terminal window (or press Ctrl+C).

set -e
cd "$(dirname "$0")"
PORT="${TRADEUP_PORT:-8000}"
URL="http://127.0.0.1:$PORT"

echo "TradeUp — starting…"

# 1. Python + dependencies (first run only installs)
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: Python 3.11+ is required (brew install python@3.11)"; exit 1
fi
if [ ! -d .venv ]; then
  echo "  first run: creating Python environment…"
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r backend/requirements.txt 2>/dev/null

# 2. Frontend build (skipped when nothing changed)
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js 18+ is required (https://nodejs.org)"; exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "  first run: installing frontend packages…"
  (cd frontend && npm install --no-audit --no-fund --loglevel=error)
fi
if [ ! -f frontend/dist/index.html ] || \
   [ -n "$(find frontend/src frontend/index.html frontend/public -newer frontend/dist/index.html -print -quit 2>/dev/null)" ]; then
  echo "  building the app…"
  (cd frontend && npm run build --silent)
fi

# 3. Already running? Then just open it.
if curl -s "$URL/api/health" >/dev/null 2>&1; then
  echo "TradeUp is already running."
  open "$URL"
  exit 0
fi

echo "  starting server at $URL  (close this window to stop TradeUp)"
( sleep 3; open "$URL" ) &
exec .venv/bin/uvicorn app.main:app --port $PORT --app-dir backend

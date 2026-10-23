#!/bin/bash
# TradeUp — stop the running app (macOS/Linux).
# Stops the server listening on $TRADEUP_PORT (default 8000).

PORT="${TRADEUP_PORT:-8000}"
pids=$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)

if [ -z "$pids" ]; then
  echo "TradeUp is not running (nothing listening on port $PORT)."
  exit 0
fi

echo "Stopping TradeUp (port $PORT)…"
kill $pids 2>/dev/null
for i in 1 2 3 4 5; do
  sleep 1
  [ -z "$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)" ] && break
done
# still alive? force
[ -n "$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)" ] && kill -9 $pids 2>/dev/null

if [ -z "$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null)" ]; then
  echo "TradeUp stopped. Your journal (data/journal/) is safe."
else
  echo "Could not stop the process on port $PORT — kill it manually: kill $pids"
  exit 1
fi
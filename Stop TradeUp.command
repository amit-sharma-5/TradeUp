#!/bin/bash
# Double-clickable wrapper for macOS Finder (calls stop_tradeup.sh).
cd "$(dirname "$0")"
exec ./stop_tradeup.sh

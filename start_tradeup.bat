@echo off
rem TradeUp - one-click start for Windows.
rem Double-click this file. Close the window to stop TradeUp.
title TradeUp
cd /d "%~dp0"
if "%TRADEUP_PORT%"=="" set PORT=8000
if not "%TRADEUP_PORT%"=="" set PORT=%TRADEUP_PORT%
set URL=http://127.0.0.1:%PORT%

echo TradeUp - starting...

rem 1. Python + dependencies (first run only installs)
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python 3.11+ is required - install from https://www.python.org/downloads/
  pause & exit /b 1
)
if not exist .venv (
  echo   first run: creating Python environment...
  python -m venv .venv
)
.venv\Scripts\pip install -q -r backend\requirements.txt 2>nul

rem 2. Frontend build (skipped when nothing changed)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 18+ is required - install from https://nodejs.org
  pause & exit /b 1
)
if not exist frontend\node_modules (
  echo   first run: installing frontend packages...
  pushd frontend && npm install --no-audit --no-fund --loglevel=error && popd
)
if not exist frontend\dist\index.html (
  echo   building the app...
  pushd frontend && npm run build --silent && popd
)

rem 3. Already running? Then just open it.
curl -s %URL%/api/health >nul 2>nul
if not errorlevel 1 (
  echo TradeUp is already running.
  start %URL%
  exit /b 0
)

echo   starting server at %URL%  (close this window to stop TradeUp)
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start %URL%"
.venv\Scripts\uvicorn app.main:app --port %PORT% --app-dir backend
pause

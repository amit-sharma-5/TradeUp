@echo off
rem TradeUp - stop the running app (Windows).
rem Stops the server listening on %TRADEUP_PORT% (default 8000).
if "%TRADEUP_PORT%"=="" set PORT=8000
if not "%TRADEUP_PORT%"=="" set PORT=%TRADEUP_PORT%

set FOUND=
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  set FOUND=%%p
)

if "%FOUND%"=="" (
  echo TradeUp is not running ^(nothing listening on port %PORT%^).
  exit /b 0
)

echo Stopping TradeUp ^(port %PORT%^)...
taskkill /PID %FOUND% >nul 2>nul
timeout /t 2 /nobreak >nul
tasklist /FI "PID eq %FOUND%" 2>nul | findstr /i uvicorn >nul
if not errorlevel 1 (
  taskkill /F /PID %FOUND% >nul 2>nul
)

netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  echo TradeUp stopped. Your journal ^(data\journal\^) is safe.
) else (
  echo Could not stop the process on port %PORT% - close the server window manually.
  exit /b 1
)

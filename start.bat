@echo off
setlocal
cd /d "%~dp0"

set PORT=3000
set URL=http://localhost:%PORT%

where node >nul 2>&1
if errorlevel 1 goto :need_node
where npm >nul 2>&1
if errorlevel 1 goto :need_node

for /f "tokens=1 delims=." %%A in ('node -p "process.versions.node"') do set NODE_MAJOR=%%A
if %NODE_MAJOR% LSS 20 (
  echo Found Node.js, but this project needs version 20 or newer.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Server already running at %URL%
  start "" "%URL%"
  exit /b 0
)

echo Starting local server at %URL%
start "" cmd /c "timeout /t 3 /nobreak >nul & start "" %URL%"
call npm run dev
pause
exit /b 0

:need_node
echo Node.js 20+ is required. Install it from https://nodejs.org/ then run this file again.
pause
exit /b 1

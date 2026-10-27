@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this demo. Install Node.js 22 or newer, then reopen this file.
  pause
  exit /b 1
)
echo.
echo Stand For Women - Sales Demo
echo.
echo Open http://localhost:5173 for the website.
echo Open http://localhost:5173/admin for the content dashboard.
echo Keep this window open during your presentation. Press Ctrl+C to stop.
echo.
node server.mjs
pause

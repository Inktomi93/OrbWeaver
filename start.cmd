@echo off
rem Double-click start for Windows: runs `pnpm start` in this console, where setup can ask its questions, and keeps
rem the window open when the start is refused or the server stops with an error, so the reason stays on screen.
setlocal
cd /d "%~dp0"
where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm was not found. Install it as "From source" in README.md says, then run start.cmd again.
  pause
  exit /b 1
)
call pnpm start %*
set "code=%errorlevel%"
if not "%code%"=="0" (
  echo.
  echo pnpm start stopped with exit code %code%. The reason is above.
  pause
)
exit /b %code%

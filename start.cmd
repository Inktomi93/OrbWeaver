@echo off
rem Double-click start for Windows: runs `pnpm start` in this console, where setup can ask its questions, and keeps
rem the window open when the start is refused or the server stops with an error, so the reason stays on screen.
rem Ctrl-C or closing the window stops the server cleanly.
setlocal
cd /d "%~dp0"
set "UI=%~dp0scripts\launcher\ui.cmd"
call "%UI%" :init
call "%UI%" :banner "roleplay with your friends, live"

where pnpm >nul 2>nul
if errorlevel 1 (
  call "%UI%" :fail "pnpm isn't installed. Run install.cmd, or install it as README.md says, then run start.cmd again."
  pause
  exit /b 1
)

call "%UI%" :port
call "%UI%" :probe "%ORB_PORT%"
if "%ORB_UP%"=="1" (
  call "%UI%" :ok "Orbweaver is already running at http://localhost:%ORB_PORT%"
  timeout /t 5 >nul
  exit /b 0
)

if not exist node_modules (
  call "%UI%" :step "Installing dependencies, first run only"
  call pnpm install --frozen-lockfile
  if errorlevel 1 (
    call "%UI%" :fail "pnpm install failed. The reason is above."
    pause
    exit /b 1
  )
)

call "%UI%" :step "Starting. Ctrl-C or closing this window stops it cleanly."
call pnpm start %*
set "code=%errorlevel%"
if not "%code%"=="0" (
  echo.
  call "%UI%" :fail "pnpm start stopped with exit code %code%. The reason is above."
  pause
)
exit /b %code%

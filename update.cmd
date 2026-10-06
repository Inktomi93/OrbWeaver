@echo off
rem Update Orbweaver in place on Windows, then start it again. A running source install is stopped in its own
rem window (Ctrl-C, or close it: the server drains first); this waits for that instead of killing it. A Docker
rem install is pulled and recreated by compose. `update.cmd --no-start` updates without starting.
rem
rem cmd reads a running batch file by byte offset, and the pull below can rewrite this one, so it first copies
rem itself to %TEMP% and runs from there.
if not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\orbweaver-update.cmd" >nul
  "%TEMP%\orbweaver-update.cmd" --from-temp "%~dp0" %*
  exit /b
)
setlocal
cd /d "%~2"
set "START_AFTER=1"
if /i "%~3"=="--no-start" set "START_AFTER=0"
set "UI=%CD%\scripts\launcher\ui.cmd"
call "%UI%" :init
call "%UI%" :banner "checking for a newer version"

where git >nul 2>nul || (call "%UI%" :fail "git isn't installed. Run install.cmd, or install Git for Windows." & goto :failed)
if not exist .git (call "%UI%" :fail "This folder isn't a git checkout, so it can't update itself. Reinstall with install.cmd." & goto :failed)

rem Local edits to tracked files would make the pull fail or merge into them. Say so rather than stash them away.
set "DIRTY="
for /f "delims=" %%l in ('git status --porcelain --untracked-files^=no') do set "DIRTY=1"
if defined DIRTY (
  call "%UI%" :fail "This checkout has local changes, so updating could overwrite or tangle them:"
  git status --short --untracked-files=no
  call "%UI%" :note "Commit or undo them, git stash works, then run update.cmd again."
  goto :failed
)

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
for /f %%h in ('git rev-parse --short HEAD') do set "BEFORE=%%h"
call "%UI%" :step "Fetching %BRANCH%"
git fetch --quiet origin %BRANCH% || (call "%UI%" :fail "git fetch failed. Check your connection." & goto :failed)
for /f %%h in ('git rev-parse HEAD') do set "LOCAL=%%h"
for /f %%h in ('git rev-parse origin/%BRANCH%') do set "REMOTE=%%h"
set "UPDATED=1"
if "%LOCAL%"=="%REMOTE%" (
  set "UPDATED=0"
  call "%UI%" :ok "Already up to date."
)

set "DOCKER_INSTALL="
where docker >nul 2>nul && for /f %%c in ('docker compose ps -q orbweaver 2^>nul') do set "DOCKER_INSTALL=1"
if defined DOCKER_INSTALL goto :docker

rem Labels, not parenthesized blocks: cmd expands %VAR% in a block once, before anything in it runs.
if not "%UPDATED%"=="1" goto :launch
call :stopfirst
call "%UI%" :step "Updating from %BEFORE%"
git pull --ff-only --quiet || goto :pullfailed
call "%UI%" :step "Installing dependencies"
call pnpm install --frozen-lockfile || goto :failed
for /f %%h in ('git describe --tags --match v[0-9]* --always') do call "%UI%" :ok "Updated to %%h."

:launch
if "%START_AFTER%"=="1" (
  call start.cmd
  exit /b
)
call "%UI%" :note "Start it with start.cmd"
exit /b 0

:docker
if "%UPDATED%"=="1" git pull --ff-only --quiet || goto :pullfailed
call "%UI%" :step "Pulling the newest image"
docker compose pull || goto :failed
rem compose sends SIGTERM and waits for the drain, stop_grace_period, before it recreates the container.
call "%UI%" :step "Restarting the container"
docker compose up -d || goto :failed
call "%UI%" :port
call "%UI%" :ok "Orbweaver is running at http://localhost:%ORB_PORT%"
timeout /t 5 >nul
exit /b 0

:stopfirst
call "%UI%" :port
call "%UI%" :probe "%ORB_PORT%"
if not "%ORB_UP%"=="1" exit /b 0
call "%UI%" :step "Orbweaver is running on port %ORB_PORT%. Stop it in its own window: Ctrl-C, or close the window."
call "%UI%" :note "It finishes what it's doing and closes the database first. Waiting for it."
:waitstop
timeout /t 1 /nobreak >nul
call "%UI%" :probe "%ORB_PORT%"
if "%ORB_UP%"=="1" goto :waitstop
call "%UI%" :ok "Stopped cleanly."
exit /b 0

:pullfailed
call "%UI%" :fail "git pull failed. The reason is above."
:failed
pause
exit /b 1

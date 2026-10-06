@echo off
rem Install Orbweaver on Windows: double-click this file. It installs Git and pnpm with winget when they are
rem missing, clones the stable `release` branch into %USERPROFILE%\OrbWeaver (or ORB_DIR), then runs it from
rem source or with Docker. Standalone on purpose: it runs before the repository exists on this machine.
setlocal
for /f %%e in ('echo prompt $E^| cmd') do set "ESC=%%e"
set "E=%ESC%[38;2;236;145;69m" & set "C=%ESC%[38;2;240;232;220m" & set "D=%ESC%[2m" & set "R=%ESC%[38;2;232;98;92m"
set "G=%ESC%[38;2;134;196;120m" & set "B=%ESC%[1m" & set "X=%ESC%[0m"
if defined NO_COLOR (set "E=" & set "C=" & set "D=" & set "R=" & set "G=" & set "B=" & set "X=")
set "REPO_URL=https://github.com/Inktomi93/OrbWeaver.git"
if not defined ORB_DIR set "ORB_DIR=%USERPROFILE%\OrbWeaver"

echo.
echo %E%            \    ^|    /%X%
echo %E%        .    \   ^|   /    .%X%
echo %E%     ---------( @ )---------%X%     %B%%C%O R B W E A V E R%X%
echo %E%        .    /   ^|   \    .%X%     %D%roleplay with your friends, live%X%
echo %E%            /    ^|    \%X%
echo.
echo %D%  One dude built this, and it's an alpha. Your characters, chats and keys stay on this machine.%X%
echo.

if exist "%ORB_DIR%" (
  echo %R%x%X% %ORB_DIR% already exists. To update it, run update.cmd inside it.
  goto :failed
)

where git >nul 2>nul
if errorlevel 1 call :wingetinstall Git.Git "Git" "%ProgramFiles%\Git\cmd"
where git >nul 2>nul || (echo %R%x%X% Git still isn't available. Install Git for Windows, then run install.cmd again. & goto :failed)

set "MODE=source"
where docker >nul 2>nul || goto :choosepnpm
docker compose version >nul 2>nul || goto :choosepnpm
echo   %B%1%X%  From source  %D%pnpm; the default, best for tinkering%X%
echo   %B%2%X%  Docker       %D%the published image; nothing to build%X%
echo.
set "CHOICE=1"
set /p "CHOICE=%E%?%X% How do you want to run it? [1] "
if "%CHOICE%"=="2" set "MODE=docker"

:choosepnpm
if "%MODE%"=="docker" goto :clone
where pnpm >nul 2>nul
if errorlevel 1 call :wingetinstall pnpm.pnpm "pnpm" "%LOCALAPPDATA%\Microsoft\WinGet\Links"
where pnpm >nul 2>nul || (echo %R%x%X% pnpm still isn't available. Open a new window and run install.cmd again. & goto :failed)

:clone
echo %E%^>%X% Cloning the stable release into %ORB_DIR%
git clone --quiet --branch release "%REPO_URL%" "%ORB_DIR%" || goto :failed
cd /d "%ORB_DIR%"
echo %G%+%X% Cloned.
if "%MODE%"=="docker" goto :docker

echo %E%^>%X% Installing dependencies
call pnpm install --frozen-lockfile || goto :failed
echo %G%+%X% Installed. From now on: start.cmd runs it, update.cmd updates it.
call start.cmd
exit /b

:docker
echo %E%^>%X% Starting the container. The first pull takes a minute.
docker compose up -d || goto :failed
echo %G%+%X% Orbweaver is running at http://localhost:8788
echo %D%  Update later with update.cmd in %ORB_DIR%. docker\README.md covers logins, LAN and backups.%X%
start "" http://localhost:8788
pause
exit /b 0

rem :wingetinstall <winget id> <name> <folder its command lands in>. A fresh install is not on this window's PATH
rem until a new console opens, so the folder is added here.
:wingetinstall
where winget >nul 2>nul || (echo %R%x%X% %~2 isn't installed and winget isn't available to install it. Install %~2, then run install.cmd again. & exit /b 1)
echo %E%^>%X% Installing %~2 with winget
winget install --exact --id %~1 --accept-source-agreements --accept-package-agreements || exit /b 1
set "PATH=%PATH%;%~3"
exit /b 0

:failed
echo.
pause
exit /b 1

@echo off
rem Shared look for start.cmd, update.cmd and install.cmd: `call scripts\launcher\ui.cmd :init` once, then
rem `call ...\ui.cmd :banner "subtitle"`, `:step`, `:ok`, `:fail`, `:note`. No setlocal, so :init's colors and
rem :port's ORB_PORT land in the caller's environment.
goto %~1

:init
for /f %%e in ('echo prompt $E^| cmd') do set "ORB_ESC=%%e"
if defined NO_COLOR (
  set "ORB_EMBER=" & set "ORB_CREAM=" & set "ORB_DIM=" & set "ORB_RED=" & set "ORB_GREEN=" & set "ORB_BOLD=" & set "ORB_RESET="
  exit /b 0
)
set "ORB_EMBER=%ORB_ESC%[38;2;236;145;69m"
set "ORB_CREAM=%ORB_ESC%[38;2;240;232;220m"
set "ORB_DIM=%ORB_ESC%[2m"
set "ORB_RED=%ORB_ESC%[38;2;232;98;92m"
set "ORB_GREEN=%ORB_ESC%[38;2;134;196;120m"
set "ORB_BOLD=%ORB_ESC%[1m"
set "ORB_RESET=%ORB_ESC%[0m"
exit /b 0

:banner
echo.
echo %ORB_EMBER%            \    ^|    /%ORB_RESET%
echo %ORB_EMBER%        .    \   ^|   /    .%ORB_RESET%
echo %ORB_EMBER%     ---------( @ )---------%ORB_RESET%     %ORB_BOLD%%ORB_CREAM%O R B W E A V E R%ORB_RESET%
echo %ORB_EMBER%        .    /   ^|   \    .%ORB_RESET%     %ORB_DIM%%~2%ORB_RESET%
echo %ORB_EMBER%            /    ^|    \%ORB_RESET%
echo.
exit /b 0

:step
echo %ORB_EMBER%^>%ORB_RESET% %~2
exit /b 0

:ok
echo %ORB_GREEN%+%ORB_RESET% %~2
exit /b 0

:note
echo %ORB_DIM%  %~2%ORB_RESET%
exit /b 0

:fail
echo %ORB_RED%x%ORB_RESET% %~2
exit /b 0

rem Sets ORB_PORT: PORT from .env in the current folder, else the default.
:port
set "ORB_PORT=8788"
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set "ORB_PORT=%%b"
exit /b 0

rem Sets ORB_UP=1 when anything answers on the port: /healthz answers 503 while the server drains.
:probe
set "ORB_UP=0"
for /f %%c in ('curl.exe -s -o nul -w "%%{http_code}" --max-time 2 http://127.0.0.1:%~2/healthz 2^>nul') do if not "%%c"=="000" set "ORB_UP=1"
exit /b 0

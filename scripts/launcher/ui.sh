# Shared look for start.sh and update.sh: the banner, status lines, a spinner for slow steps, and the health probe.
# install.sh carries its own copy because it runs from `curl | bash` before this file exists.
# shellcheck shell=bash

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  ORB_EMBER=$'\033[38;2;236;145;69m'
  ORB_CREAM=$'\033[38;2;240;232;220m'
  ORB_DIM=$'\033[2m'
  ORB_RED=$'\033[38;2;232;98;92m'
  ORB_GREEN=$'\033[38;2;134;196;120m'
  ORB_BOLD=$'\033[1m'
  ORB_RESET=$'\033[0m'
else
  ORB_EMBER="" ORB_CREAM="" ORB_DIM="" ORB_RED="" ORB_GREEN="" ORB_BOLD="" ORB_RESET=""
fi

orb_banner() {
  local subtitle="$1"
  printf '\n'
  printf '%s            ╲    │    ╱%s\n' "$ORB_EMBER" "$ORB_RESET"
  printf '%s        ·    ╲   │   ╱    ·%s\n' "$ORB_EMBER" "$ORB_RESET"
  printf '%s     ─────────( ◉ )─────────%s     %s%sO R B W E A V E R%s\n' "$ORB_EMBER" "$ORB_RESET" "$ORB_BOLD" "$ORB_CREAM" "$ORB_RESET"
  printf '%s        ·    ╱   │   ╲    ·%s     %s%s%s\n' "$ORB_EMBER" "$ORB_RESET" "$ORB_DIM" "$subtitle" "$ORB_RESET"
  printf '%s            ╱    │    ╲%s\n\n' "$ORB_EMBER" "$ORB_RESET"
}

orb_step() { printf '%s▸%s %s\n' "$ORB_EMBER" "$ORB_RESET" "$*"; }
orb_ok() { printf '%s✓%s %s\n' "$ORB_GREEN" "$ORB_RESET" "$*"; }
orb_note() { printf '%s  %s%s\n' "$ORB_DIM" "$*" "$ORB_RESET"; }
orb_fail() { printf '%s✗%s %s\n' "$ORB_RED" "$ORB_RESET" "$*" >&2; }

# Run a slow command behind a spinner. Its output goes to a log that is shown only when it fails.
orb_spin() {
  local label="$1"
  shift
  local log
  log=$(mktemp "${TMPDIR:-/tmp}/orbweaver.XXXXXX")
  "$@" > "$log" 2>&1 &
  local pid=$! frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
  if [ -t 1 ]; then
    while kill -0 "$pid" 2> /dev/null; do
      printf '\r%s%s%s %s' "$ORB_EMBER" "${frames:i++%${#frames}:1}" "$ORB_RESET" "$label"
      sleep 0.08
    done
    printf '\r\033[K'
  fi
  if wait "$pid"; then
    orb_ok "$label"
    rm -f "$log"
    return 0
  fi
  orb_fail "$label failed. The last lines it printed:"
  tail -n 25 "$log" >&2
  orb_note "Full output: $log"
  return 1
}

# The port a source install serves on: PORT from .env, else the default.
orb_port() {
  local port=""
  [ -f .env ] && port=$(sed -n 's/^PORT=\([0-9][0-9]*\).*/\1/p' .env | tail -n 1)
  printf '%s' "${port:-8788}"
}

# Any HTTP answer means a server holds the port: /healthz answers 503 while it drains or is degraded.
orb_running() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$1/healthz" 2> /dev/null)
  [ -n "$code" ] && [ "$code" != "000" ]
}

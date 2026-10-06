#!/usr/bin/env bash
# Install Orbweaver on Linux or macOS:
#   curl -fsSL https://raw.githubusercontent.com/Inktomi93/OrbWeaver/release/install.sh | bash
# Clones the stable `release` branch into ./OrbWeaver (or ORB_DIR), then runs it from source or with Docker
# (ORB_MODE=source or docker skips the question).
# Under `curl | bash` stdin is this script, so questions read the terminal directly.
set -euo pipefail

REPO_URL="https://github.com/Inktomi93/OrbWeaver.git"
TARGET="${ORB_DIR:-OrbWeaver}"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != "dumb" ]; then
  E=$'\033[38;2;236;145;69m' C=$'\033[38;2;240;232;220m' D=$'\033[2m' R=$'\033[38;2;232;98;92m'
  G=$'\033[38;2;134;196;120m' B=$'\033[1m' X=$'\033[0m'
else
  E="" C="" D="" R="" G="" B="" X=""
fi
step() { printf '%s▸%s %s\n' "$E" "$X" "$*"; }
ok() { printf '%s✓%s %s\n' "$G" "$X" "$*"; }
note() { printf '%s  %s%s\n' "$D" "$*" "$X"; }
fail() { printf '%s✗%s %s\n' "$R" "$X" "$*" >&2; exit 1; }
ask() {
  local answer=""
  printf '%s?%s %s ' "$E" "$X" "$1" > /dev/tty
  read -r answer < /dev/tty || true
  printf '%s' "${answer:-$2}"
}

main() {
  printf '\n%s            ╲    │    ╱%s\n' "$E" "$X"
  printf '%s        ·    ╲   │   ╱    ·%s\n' "$E" "$X"
  printf '%s     ─────────( ◉ )─────────%s     %s%sO R B W E A V E R%s\n' "$E" "$X" "$B" "$C" "$X"
  printf '%s        ·    ╱   │   ╲    ·%s     %sroleplay with your friends, live%s\n' "$E" "$X" "$D" "$X"
  printf '%s            ╱    │    ╲%s\n\n' "$E" "$X"
  note "One dude built this, and it's an alpha. Your characters, chats and keys stay on this machine."
  printf '\n'

  command -v git > /dev/null 2>&1 || fail "git isn't installed. Install it (apt install git, dnf install git, brew install git...), then run this again."
  [ -e "$TARGET" ] && fail "$TARGET already exists. To update it, run ./update.sh inside it. To install fresh, set ORB_DIR to another folder."

  # ORB_MODE=source or ORB_MODE=docker answers the question below without asking.
  local mode="${ORB_MODE:-source}"
  if [ -z "${ORB_MODE:-}" ] && command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
    printf '  %s1%s  From source  %s(pnpm; the default, best for tinkering)%s\n' "$B" "$X" "$D" "$X"
    printf '  %s2%s  Docker       %s(the published image; nothing to build)%s\n\n' "$B" "$X" "$D" "$X"
    [ "$(ask "How do you want to run it? [1]" 1)" = 2 ] && mode="docker"
  fi

  if [ "$mode" = source ] && ! command -v pnpm > /dev/null 2>&1; then
    step "Orbweaver runs on pnpm, which also fetches the Node version it needs."
    case "$(ask "Install pnpm now? [Y/n]" y)" in
      n | N) fail "pnpm is required. Install it from https://pnpm.io/installation, then run this again." ;;
    esac
    # Downloaded whole before it runs, so a dropped connection can't execute half an installer.
    local installer
    installer=$(mktemp "${TMPDIR:-/tmp}/pnpm-install.XXXXXX")
    curl -fsSL https://get.pnpm.io/install.sh -o "$installer" || fail "Couldn't download the pnpm installer."
    sh "$installer"
    rm -f "$installer"
    export PNPM_HOME="${PNPM_HOME:-$HOME/.local/share/pnpm}"
    export PATH="$PNPM_HOME:$PATH"
    command -v pnpm > /dev/null 2>&1 || fail "pnpm installed but isn't on PATH yet. Open a new terminal and run this again."
    ok "pnpm $(pnpm --version)"
  fi

  step "Cloning the stable release into $TARGET"
  git clone --quiet --branch release "$REPO_URL" "$TARGET"
  cd "$TARGET"
  ok "Cloned $(git describe --tags --match 'v[0-9]*' --always)"

  if [ "$mode" = docker ]; then
    step "Starting the container (the first pull takes a minute)"
    docker compose up -d
    ok "Orbweaver is running at http://localhost:8788"
    note "Update later with ./update.sh in $TARGET. docker/README.md covers logins, LAN and backups."
    return 0
  fi

  step "Installing dependencies"
  pnpm install --frozen-lockfile
  ok "Installed. From now on: ./start.sh to run it, ./update.sh to update it."
  # stdin is still this script's pipe; the first start's setup questions need the terminal, when there is one.
  if [ -r /dev/tty ] && { : < /dev/tty; } 2> /dev/null; then
    exec ./start.sh < /dev/tty
  fi
  exec ./start.sh
}

main "$@"

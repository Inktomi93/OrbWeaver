#!/usr/bin/env bash
# Start Orbweaver from this checkout on Linux or macOS: the twin of start.cmd. Arguments pass through to
# `pnpm start` (`./start.sh --port 9000`, `./start.sh --setup`). Ctrl-C or closing the window stops it cleanly.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/launcher/ui.sh
. scripts/launcher/ui.sh

orb_banner "roleplay with your friends, live"

if ! command -v pnpm > /dev/null 2>&1; then
  orb_fail "pnpm isn't installed."
  orb_note "Install it, then run ./start.sh again:  curl -fsSL https://get.pnpm.io/install.sh | sh -"
  exit 1
fi

port=$(orb_port)
if orb_running "$port"; then
  orb_ok "Orbweaver is already running at http://localhost:$port"
  exit 0
fi

[ -d node_modules ] || orb_spin "Installing dependencies (first run only)" pnpm install --frozen-lockfile
orb_step "Starting. Ctrl-C or closing this window stops it cleanly."
exec pnpm start "$@"

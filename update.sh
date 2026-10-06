#!/usr/bin/env bash
# Update Orbweaver in place on Linux or macOS, then start it again. A running source install is stopped by
# its own window (Ctrl-C or closing it drains the server); this waits for that instead of killing it. A
# Docker install is pulled and recreated by compose. `./update.sh --no-start` updates without starting.
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck source=scripts/launcher/ui.sh
. scripts/launcher/ui.sh

# The pull below can replace this file while it runs, and bash reads a script as it goes: the whole body is a
# function so it is parsed before anything runs.
main() {
  local start_after=1 updated docker_install before branch port
  [ "${1:-}" = "--no-start" ] && start_after=0

  orb_banner "checking for a newer version"

  command -v git > /dev/null 2>&1 || { orb_fail "git isn't installed."; exit 1; }
  [ -d .git ] || { orb_fail "This folder isn't a git checkout, so it can't update itself. Reinstall with install.sh."; exit 1; }

  # Local edits to tracked files would make the pull fail or merge into them. Say so rather than stash them away.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    orb_fail "This checkout has local changes, so updating could overwrite or tangle them:"
    git status --short --untracked-files=no >&2
    orb_note "Commit or undo them (git stash works), then run ./update.sh again."
    exit 1
  fi

  before=$(git rev-parse --short HEAD)
  branch=$(git rev-parse --abbrev-ref HEAD)
  orb_spin "Fetching $branch" git fetch --quiet origin "$branch"
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" ]; then
    orb_ok "Already up to date ($(git describe --tags --match 'v[0-9]*' --always))."
    updated=0
  else
    updated=1
  fi

  docker_install=0
  if command -v docker > /dev/null 2>&1 && [ -n "$(docker compose ps -q orbweaver 2> /dev/null)" ]; then
    docker_install=1
  fi

  if [ "$docker_install" = 1 ]; then
    [ "$updated" = 1 ] && orb_spin "Pulling the new compose file" git pull --ff-only --quiet
    # compose sends SIGTERM and waits for the drain (stop_grace_period) before it recreates the container.
    if [ "$(docker compose ps --format '{{.Image}}' orbweaver 2> /dev/null)" = "orbweaver:local" ]; then
      # Built from this checkout with the build overlay: rebuild rather than switch to the published image.
      orb_spin "Rebuilding the image and restarting" docker compose -f docker-compose.yaml -f docker/compose.build.yaml up -d --build
    else
      orb_spin "Pulling the newest image" docker compose pull
      orb_spin "Restarting the container" docker compose up -d
    fi
    orb_ok "Orbweaver is running at http://localhost:$(orb_port)"
    exit 0
  fi

  if [ "$updated" = 1 ]; then
    port=$(orb_port)
    if orb_running "$port"; then
      orb_step "Orbweaver is running on :$port. Stop it in its own window (Ctrl-C, or close the window)."
      orb_note "It finishes what it's doing and closes the database first. Waiting for it."
      while orb_running "$port"; do sleep 1; done
      orb_ok "Stopped cleanly."
    fi
    orb_spin "Updating $before → $(git rev-parse --short "origin/$branch")" git pull --ff-only --quiet
    orb_spin "Installing dependencies" pnpm install --frozen-lockfile
    orb_ok "Updated to $(git describe --tags --match 'v[0-9]*' --always)."
  fi

  if [ "$start_after" = 1 ]; then
    exec ./start.sh
  fi
  orb_note "Start it with ./start.sh"
}

main "$@"

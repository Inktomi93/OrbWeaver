#!/usr/bin/env bash
# scripts/dev/sandbox.sh — one-shot launcher for the Claude Code sandbox (.devcontainer/) WITHOUT
# VS Code: ensures the dev container is built + running (devcontainers CLI, idempotent), then opens
# a NEW terminal window shelled into it with Claude already started in permissive mode. When Claude
# exits, the window drops to a zsh inside the container instead of closing (so `pnpm check` etc.
# are one keystroke away). HOST-side script — never run inside the container ($DEVCONTAINER guard).
#
#   pnpm sandbox              build/start + open Claude in a new terminal window
#   pnpm sandbox --here       same, but in THIS terminal (no new window; also the SSH fallback)
#   pnpm sandbox --shell      open a plain zsh in the container instead of Claude
#   pnpm sandbox --rebuild    force-rebuild the container first (after editing .devcontainer/*)
#
# Extra args pass through to claude: `pnpm sandbox -- --resume`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ "${DEVCONTAINER:-}" = "true" ]; then
  echo "sandbox.sh runs on the HOST (you are already inside the container)." >&2
  exit 1
fi

HERE=0
SHELL_ONLY=0
REBUILD=0
CLAUDE_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --here) HERE=1 ;;
    --shell) SHELL_ONLY=1 ;;
    --rebuild) REBUILD=1 ;;
    --) shift; CLAUDE_ARGS+=("$@"); break ;;
    *) CLAUDE_ARGS+=("$1") ;;
  esac
  shift
done

# 1. Ensure the container is up (idempotent: reuses a running one, starts a stopped one, builds on
#    first run). --remove-existing-container only on --rebuild.
UP_ARGS=(up --workspace-folder .)
if [ "$REBUILD" = 1 ]; then
  UP_ARGS+=(--remove-existing-container)
fi
echo "▶ ensuring the sandbox container is up (first build takes a few minutes)…"
npx --yes @devcontainers/cli "${UP_ARGS[@]}"

# 2. The command that runs INSIDE the container. Claude in permissive mode is the point of the
#    sandbox (the firewall + container are the boundary); on exit, fall through to zsh.
if [ "$SHELL_ONLY" = 1 ]; then
  INNER='exec zsh -l'
else
  INNER='claude --dangerously-skip-permissions'
  for a in ${CLAUDE_ARGS[@]+"${CLAUDE_ARGS[@]}"}; do
    INNER="$INNER $(printf '%q' "$a")"
  done
  INNER="$INNER; exec zsh -l"
fi
EXEC_CMD=(npx --yes @devcontainers/cli exec --workspace-folder . zsh -lc "$INNER")

# 3. Run it — in THIS terminal (--here / no GUI terminal found) or a fresh window.
if [ "$HERE" = 1 ]; then
  exec "${EXEC_CMD[@]}"
fi

# Detect a terminal emulator: $TERMINAL override first, then the common ones. Each gets the exec
# command in its own argv form (no shell re-quoting — the INNER string is the only shell layer).
open_in() {
  local term="$1"
  case "$term" in
    gnome-terminal)
      exec gnome-terminal --working-directory="$REPO_ROOT" --title="orbweaver sandbox" -- "${EXEC_CMD[@]}" ;;
    konsole)
      exec konsole --workdir "$REPO_ROOT" -e "${EXEC_CMD[@]}" ;;
    kitty)
      exec kitty --directory "$REPO_ROOT" "${EXEC_CMD[@]}" ;;
    alacritty)
      exec alacritty --working-directory "$REPO_ROOT" -e "${EXEC_CMD[@]}" ;;
    wezterm)
      exec wezterm start --cwd "$REPO_ROOT" -- "${EXEC_CMD[@]}" ;;
    xfce4-terminal)
      exec xfce4-terminal --working-directory="$REPO_ROOT" -x "${EXEC_CMD[@]}" ;;
    x-terminal-emulator)
      exec x-terminal-emulator -e "${EXEC_CMD[@]}" ;;
    *)
      return 1 ;;
  esac
}

if [ -n "${TERMINAL:-}" ] && command -v "$TERMINAL" >/dev/null 2>&1; then
  open_in "$TERMINAL" || true
fi
for term in gnome-terminal konsole kitty alacritty wezterm xfce4-terminal x-terminal-emulator; do
  if command -v "$term" >/dev/null 2>&1; then
    open_in "$term"
  fi
done

echo "no GUI terminal emulator found — running here instead (same as --here)" >&2
exec "${EXEC_CMD[@]}"

#!/usr/bin/env bash
# orbweaver worktree bootstrap — make a fresh git worktree fully usable.
#
# Worktree-safe: resolves the root via git (no hardcoded paths, no dependence on $CLAUDE_* env).
# Idempotent. Does a PROPER per-worktree `pnpm install` — NOT a symlink to the main checkout's
# node_modules (branches can carry different deps, and a shared node_modules then lies). pnpm's global
# content-addressable store makes the per-worktree install fast via hard-links — no re-download,
# minimal disk.
#
# `pnpm install` also runs the root `prepare` script (`node scripts/prepare.ts`), which installs
# lefthook, so git hooks are wired for this worktree automatically. The only thing install can't
# provide is the gitignored .env (secrets), which we link from the main checkout if present.
#
# Usage:  pnpm run worktree:bootstrap   (or:  bash scripts/worktree-bootstrap.sh)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
echo "worktree-bootstrap: $ROOT"

# 1. Per-worktree deps (hard-linked from the global store) + hooks (via prepare).
pnpm install

# 2. Provision .env from the main checkout if this worktree lacks one.
if [ ! -e .env ]; then
  # Consume the full inventory: an early awk exit closes the pipe while git may still be writing, and
  # pipefail turns git's SIGPIPE into a bootstrap failure before .env is provisioned.
  MAIN="$(git worktree list --porcelain | awk '/^worktree / && !seen++ {print $2}')"
  if [ -n "${MAIN:-}" ] && [ "$MAIN" != "$ROOT" ] && [ -e "$MAIN/.env" ]; then
    ln -sfn "$MAIN/.env" .env
    echo "  ↳ linked .env → $MAIN/.env"
  else
    echo "  ↳ no .env in the main checkout (create one when you need secrets)"
  fi
fi

echo "worktree-bootstrap: done — deps + hooks ready"

#!/usr/bin/env bash
# Bootstrap a checkout with separate dependencies and a consistent local CodeGraph index.
# Shared Git hooks remain owned by the main checkout.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
echo "worktree-bootstrap: $ROOT"

# 1. Per-worktree deps (hard-linked from the global store).
CI=true pnpm install

# Seed suites consume generated plugin archives from this checkout.
pnpm --filter @orb/showcase-plugins build

# 2. Provision .env from the main checkout if this worktree lacks one.
MAIN="$(git worktree list --porcelain | awk '/^worktree / && !seen++ {print substr($0, 10)}')"
if [ ! -e .env ]; then
  # Consume the full inventory: an early awk exit closes the pipe while git may still be writing, and
  # pipefail turns git's SIGPIPE into a bootstrap failure before .env is provisioned.
  if [ -n "${MAIN:-}" ] && [ "$MAIN" != "$ROOT" ] && [ -e "$MAIN/.env" ]; then
    ln -sfn "$MAIN/.env" .env
    echo "  ↳ linked .env → $MAIN/.env"
  else
    echo "  ↳ no .env in the main checkout (create one when you need secrets)"
  fi
fi

if [ -n "$MAIN" ] && [ "$MAIN" != "$ROOT" ]; then
  if [ -f "$MAIN/.claude/settings.local.json" ] && [ ! -e .claude/settings.local.json ]; then
    mkdir -p .claude
    ln -sfn "$MAIN/.claude/settings.local.json" .claude/settings.local.json
  fi

  # A SQLite backup is consistent while main's index is in use; copying the file is not.
  if [ -f "$MAIN/.codegraph/codegraph.db" ] && command -v codegraph >/dev/null; then
    if [ ! -e .codegraph ]; then
      mkdir -p .codegraph
      (cd .codegraph && sqlite3 "$MAIN/.codegraph/codegraph.db" ".backup codegraph.db")
    fi
    codegraph sync "$ROOT" </dev/null
  fi
fi

echo "worktree-bootstrap: done — deps + showcase bundles ready"

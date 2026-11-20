#!/usr/bin/env bash
# Give this worktree its own CodeGraph index: a SQLite backup of the main checkout's index, then a sync to this
# checkout's files. Run it once, before the first CodeGraph query from the worktree; a rerun only syncs.
# Without a local index the CodeGraph CLI walks up to main's index (a worktree sits below main) and answers from
# main's tree, so a lane reads code it has not changed. The bootstrap does not build the index: most worktrees
# never query it, and each index is large.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
# Consume the full inventory: an early awk exit closes the pipe while git may still be writing, and pipefail
# turns git's SIGPIPE into a failure.
MAIN="$(git worktree list --porcelain | awk '/^worktree / && !seen++ {print substr($0, 10)}')"
LABEL="worktree-codegraph-index"

if [ "$MAIN" = "$ROOT" ]; then
  echo "$LABEL: $ROOT is the main checkout; it keeps its own index. Run this in a linked worktree." >&2
  exit 2
fi
if [ ! -f "$MAIN/.codegraph/codegraph.db" ]; then
  echo "$LABEL: the main checkout has no index at $MAIN/.codegraph/codegraph.db; build it there first (codegraph init)." >&2
  exit 1
fi

cd "$ROOT"
# A symlinked database is not a local index; the backup below replaces the link itself, never its target.
if [ -f .codegraph/codegraph.db ] && [ ! -L .codegraph/codegraph.db ]; then
  echo "$LABEL: $ROOT already has an index; syncing it"
else
  # A SQLite backup is consistent while main's index is in use; copying the file is not. The database appears under
  # its final name only once the backup is complete, so an interrupted run leaves no half index.
  mkdir -p .codegraph
  (cd .codegraph && sqlite3 -readonly "$MAIN/.codegraph/codegraph.db" ".backup codegraph.db.tmp")
  mv -f .codegraph/codegraph.db.tmp .codegraph/codegraph.db
  echo "$LABEL: copied $MAIN/.codegraph/codegraph.db into $ROOT/.codegraph; syncing it"
fi
codegraph sync "$ROOT" </dev/null
echo "$LABEL: done — $ROOT/.codegraph is current"

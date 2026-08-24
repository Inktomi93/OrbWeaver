#!/usr/bin/env bash
# Point every memory-enabled subagent role at the ONE shared project memory store.
#
# WHY: `memory: project` on a role makes Claude Code load that role's own
# `<cwd>/.claude/agent-memory/<role>/MEMORY.md` into its system prompt (first 200 lines / 25KB).
# Left alone that is seven EMPTY private directories, while ~290 hard-won lessons sit unreachable in
# the shared project auto-memory store. Symlinking each role's directory at the shared store means a
# cold lane boots with the real index already in context instead of a blank file.
#
# The roles are READ-ONLY on that store by instruction (every role body carries the clause); the
# orchestrator owns every write. This script only provisions the links.
#
# WHY A SCRIPT AND NOT A COMMITTED SYMLINK: `.gitignore` ignores `.claude/agent-memory/` (the store is
# machine-local per Claude Code's own design — auto memory is never shared across machines), so the
# links cannot ride the checkout. This is the reproducible substitute, and it is idempotent.
#
# WHY IT MUST RUN PER WORKTREE: the scope resolves against the agent's CWD, not the git common dir —
# verified in the shipped CLI bundle (2.1.241): the `project` arm returns
# `join(tr(), ".claude", "agent-memory", <role>)` and `tr()` is the session store's cwd, falling back
# to `process.cwd()`. A worktree-isolated lane therefore looks inside ITS OWN tree. `.claude/hooks/
# worktree-setup.sh` and `scripts/worktree-bootstrap.sh` both call this for exactly that reason.
#
# Usage:  pnpm agent-memory:link            (this checkout)
#         bash scripts/agent-memory-link.sh <target-worktree>
set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET="$(git rev-parse --show-toplevel)"
fi
TARGET="$(cd "$TARGET" && pwd)"

note() { printf '[agent-memory-link] %s\n' "$*" >&2; }

# The shared store lives under the CONFIG dir, keyed by the MAIN worktree's path. Resolve the main
# worktree (a worktree's own path is not the key) and sanitize it the way Claude Code does.
COMMON="$(git -C "$TARGET" rev-parse --git-common-dir)"
case "$COMMON" in /*) ;; *) COMMON="$TARGET/$COMMON" ;; esac
MAIN="$(cd "$(dirname "$COMMON")" && pwd)"

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PROJECT_KEY="$(printf '%s' "$MAIN" | tr -c 'a-zA-Z0-9_-' '-')"
STORE="$CONFIG_DIR/projects/$PROJECT_KEY/memory"

# Refuse loudly rather than linking at a path that is not the real store — a silently wrong link
# would give every role an empty index and read exactly like "there are no lessons".
if [ ! -f "$STORE/MEMORY.md" ]; then
  note "REFUSING: no memory index at $STORE/MEMORY.md"
  note "  (config dir: $CONFIG_DIR · project key: $PROJECT_KEY · main worktree: $MAIN)"
  note "  Nothing was linked. Fix the store path before re-running."
  exit 1
fi

# Canonicalize: the second Claude account's projects dir is itself a symlink into the primary's store,
# so link at the REAL path and the result is identical whichever account provisioned it.
STORE="$(readlink -f "$STORE")"

AGENTS_DIR="$TARGET/.claude/agents"
if [ ! -d "$AGENTS_DIR" ]; then
  note "no $AGENTS_DIR — nothing to link"
  exit 0
fi

MEMORY_ROOT="$TARGET/.claude/agent-memory"
mkdir -p "$MEMORY_ROOT"

linked=0
for agent_file in "$AGENTS_DIR"/*.md; do
  [ -e "$agent_file" ] || continue
  # Only roles that actually declare project-scoped memory; frontmatter is the single source of truth.
  grep -q '^memory: project$' "$agent_file" || continue
  role="$(basename "$agent_file" .md)"
  dest="$MEMORY_ROOT/$role"

  if [ -L "$dest" ]; then
    ln -sfn "$STORE" "$dest"
  elif [ -d "$dest" ]; then
    if [ -z "$(ls -A "$dest")" ]; then
      rmdir "$dest"
      ln -s "$STORE" "$dest"
    else
      # Never destroy accreted lessons: park them and tell the operator they need re-homing.
      parked="$MEMORY_ROOT/$role.premigration-$(date +%Y%m%d%H%M%S)"
      mv "$dest" "$parked"
      ln -s "$STORE" "$dest"
      note "PARKED existing private memory: $parked — hand these to the orchestrator for the shared index"
    fi
  else
    ln -s "$STORE" "$dest"
  fi
  linked=$((linked + 1))
done

note "linked $linked role memory dirs in $TARGET → $STORE"

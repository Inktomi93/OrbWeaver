#!/usr/bin/env bash
# WorktreeCreate hook — create a worktree AND make it immediately usable.
#
# CONTRACT (probed 2026-07-30, undocumented): stdin is
#   {session_id, transcript_path, cwd, prompt_id, hook_event_name:"WorktreeCreate", name}
# where `cwd` is the MAIN checkout and `name` is the requested worktree name — no path is supplied.
# Configuring this hook REPLACES the built-in git-worktree creation, so this script owns it, and
# **stdout is the worktree path**: the harness chdir's into whatever we print. Anything else on
# stdout becomes a bogus directory name, so all diagnostics go to stderr or the log file.
#
# WHY: an agent that edits in a worktree with no node_modules gets a red gate and misreads it as a
# code problem. A worktree install costs 2.06 s / 48 MiB (measured) because pnpm hardlinks from the
# CAS store, so there is no reason to make anyone remember it. Do NOT "solve" this with
# enableGlobalVirtualStore — it breaks tsc and the type-aware biome/eslint rules
# (`.claude/skills/orchestrator/SKILL.md`).
set -uo pipefail

log() { printf '[worktree-setup] %s\n' "$*" >&2; }

payload=$(cat 2>/dev/null || true)
name=$(printf '%s' "$payload" | jq -r '.name // empty' 2>/dev/null)
main=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "${main:-}" ] || main="$PWD"

# The session may already be inside a worktree; resolve to the real repo root either way.
common=$(git -C "$main" rev-parse --git-common-dir 2>/dev/null) || { log "not a git repo: $main"; exit 1; }
case "$common" in /*) ;; *) common="$main/$common" ;; esac
root=$(cd "$(dirname "$common")" && pwd)

[ -n "${name:-}" ] || name="wt-$$"
name=${name//[^A-Za-z0-9._\/-]/-}          # same charset the harness allows
dir="$root/.claude/worktrees/$name"
branch="wt/$name"

if [ ! -d "$dir" ]; then
  # Branch from the main checkout so lanes include its unpushed commits.
  base=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo HEAD)
  if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$root" worktree add "$dir" "$branch" >&2 || { log "worktree add failed"; exit 1; }
  else
    git -C "$root" worktree add -b "$branch" "$dir" "$base" >&2 || { log "worktree add failed"; exit 1; }
  fi
fi

# Keep the hook protocol on stdout; bootstrap diagnostics belong on stderr.
(cd "$dir" && bash scripts/worktree-bootstrap.sh) >&2 || { log "bootstrap failed ($name)"; exit 1; }

printf '%s\n' "$dir"

#!/usr/bin/env bash
# WorktreeRemove hook — tear down what worktree-setup.sh created.
#
# Pairs with the WorktreeCreate hook: because that hook takes over creation, the harness cannot be
# assumed to know how to undo it.
#
# CONTRACT (probed 2026-07-30, undocumented): stdin is
#   {session_id, transcript_path, cwd, prompt_id, hook_event_name:"WorktreeRemove", worktree_path}
# Unlike WorktreeCreate this one DOES carry worktree_path, and `cwd` is the worktree being removed
# (not the main checkout) — hence the git-common-dir walk below rather than trusting cwd as root.
set -uo pipefail

log() { printf '[worktree-remove] %s\n' "$*" >&2; }

payload=$(cat 2>/dev/null || true)
dir=$(printf '%s' "$payload" | jq -r '.worktree_path // empty' 2>/dev/null)
name=$(printf '%s' "$payload" | jq -r '.name // empty' 2>/dev/null)
main=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "${main:-}" ] || main="$PWD"

common=$(git -C "$main" rev-parse --git-common-dir 2>/dev/null) || exit 0
case "$common" in /*) ;; *) common="$main/$common" ;; esac
root=$(cd "$(dirname "$common")" && pwd)

if [ -z "${dir:-}" ] && [ -n "${name:-}" ]; then
  name=${name//[^A-Za-z0-9._\/-]/-}
  dir="$root/.claude/worktrees/$name"
fi
[ -n "${dir:-}" ] || { log "no worktree identified in payload; nothing to do"; exit 0; }

# Refuse to touch anything outside the managed worktree directory.
case "$dir" in
  "$root/.claude/worktrees/"*) ;;
  *) log "refusing to remove out-of-scope path: $dir"; exit 0 ;;
esac

branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)

# TEAR DOWN THE STAGE THIS WORKTREE OWNS, BEFORE THE DIRECTORY GOES (#1848).
#
# A `snap --isolated` stage is a ~7-process stack (stack.sh, the node server, vite, the idle keeper) living
# inside <worktree>/.cache/snap-stage/, and the band table (<main>/.cache/snap-stage/bands.json) records the
# owning CHECKOUT. This hook used to remove the tree without consulting it, so a lane torn down with a live
# stage kept running with a DELETED cwd — holding a band, a port pair and real CPU — until the 60-minute
# idle keeper reaped it. Observed 2026-09-06: two bands owned by worktrees that no longer existed.
#
# The teardown goes through snap's OWN door (`--stage-down --stage-owner <checkout> --force`), never a raw
# kill: that door stops the staged stack with its own launcher, kills only stage-rooted process groups, and
# clears the row + the reap ledger. The jq pre-check keeps the common case (no stage) free of a node spawn.
if [ -r "$root/.cache/snap-stage/bands.json" ] &&
  jq -e --arg dir "$dir" '(.rows // []) | map(select(.checkout == $dir)) | length > 0' "$root/.cache/snap-stage/bands.json" >/dev/null 2>&1; then
  log "worktree owns a live stage band — tearing it down before removal"
  (cd "$root" && pnpm snap --stage-down --stage-owner "$dir" --force >&2 2>&1) || log "stage teardown reported a problem; continuing with the worktree removal"
fi

git -C "$root" worktree remove --force "$dir" >&2 2>/dev/null || rm -rf "$dir"
git -C "$root" worktree prune >&2 2>/dev/null || true

# Only delete branches this hook's naming scheme owns, and only if merged-or-empty is not required:
# -D is intentional (a discarded experiment branch should not linger), but scoped to the wt/ prefix.
case "${branch:-}" in
  wt/*) git -C "$root" branch -D "$branch" >&2 2>/dev/null || true ;;
esac

log "removed ${dir##*/}"

#!/usr/bin/env bash
# Release this checkout's Snap stage; the caller owns Git worktree removal.
set -euo pipefail

checkout=$(pwd -P)
# An orphan directory must not let Git walk upward into another checkout.
[ -e "$checkout/.git" ] || { echo "worktree-cleanup: no .git in $checkout" >&2; exit 1; }
common=$(git -C "$checkout" rev-parse --path-format=absolute --git-common-dir)
root=$(cd "$(dirname "$common")" && pwd -P)
table="$root/.cache/snap-stage/bands.json"

if [ -r "$table" ]; then
  owned=$(jq --arg checkout "$checkout" '[.rows[]? | select(.checkout == $checkout)] | length' "$table")
  if [ "$owned" -gt 0 ]; then
    (cd "$root" && pnpm snap --stage-down --stage-owner "$checkout" --force)
  fi
fi

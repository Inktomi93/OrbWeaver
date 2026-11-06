#!/usr/bin/env bash
# Keep this checkout's written reports and release its Snap stage; the caller owns Git worktree removal.
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

# Reports are gitignored, so removal would delete them. Only written reports move: run output such as
# reports/ct-results is bulky and rebuilt by the next run. A report main already holds with other text may
# carry later additions, so it stays and this copy lands beside it.
if [ "$checkout" != "$root" ]; then
  for family in lanes code-reviewer ux-reviewer deep-reviewer; do
    [ -d "$checkout/reports/$family" ] || continue
    (cd "$checkout/reports" && find "$family" -type f) | while IFS= read -r report; do
      target="$root/reports/$report"
      mkdir -p "$(dirname "$target")"
      if [ ! -e "$target" ]; then
        cp -p "$checkout/reports/$report" "$target"
      elif ! cmp -s "$checkout/reports/$report" "$target"; then
        cp -p "$checkout/reports/$report" "$target.$(basename "$checkout")"
      fi
    done
  done
fi

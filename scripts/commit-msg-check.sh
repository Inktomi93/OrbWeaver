#!/usr/bin/env bash
# Commit-message contract, enforced at TWO doors because lanes commit with hooks bypassed (#1584):
#   1. lefthook `commit-msg` -> `scripts/commit-msg-check.sh <msgfile>`   (the author's own commit)
#   2. `scripts/commit-msg-check.sh --range main..<branch>`                (the orchestrator, at landing)
# Rules, DERIVED from the 6,344-commit history on 2026-09-18 (96% already conform):
#   header   `type(scope): subject` — type in TYPES (the 11 the history uses; `gate`/`wip`/`client`-as-type
#            were always scopes), scope optional and free-form in the charset the history uses, `!` allowed,
#            subject non-empty, <= 200 chars (a 120 cap would have refused 11% of history; 200 refuses 0.7%)
#   body     OPTIONAL — 55% of docs and 39% of chore commits are one-liners by long-standing practice
#   trailer  at least one `Co-Authored-By: Name <local@domain>` (every commit in history carries one; the
#            addresses are noreply@anthropic.com / noreply@openai.com / codex@openai.com) and every trailer
#            well-formed: no spaces or angle-bracket junk in the address (the Qwen lane emits `<qwen-lane @local>`)
#   closes   an OPTIONAL `Closes: 12, 14` trailer names the work items (docs/work/) this commit lands; the
#            post-merge hook on main reads it (`pnpm doc land --merged`). Well-formed = comma-separated ids.
# Git-generated messages (merge, revert, fixup!, squash!) are exempt. ORB_HUMAN_COMMIT=1 waives the
# trailer rule only — for a hand-typed owner commit, never for a lane.
set -uo pipefail
TYPES='feat|fix|docs|test|chore|refactor|perf|style|build|ci|revert'
HEADER_RE="^(${TYPES})(\([A-Za-z0-9#+,./-]+\))?!?: [^ ].*$"
TRAILER_RE='^Co-[Aa]uthored-[Bb]y: [^<>]+ <[^[:space:]<>@]+@[^[:space:]<>@]+>$'
CLOSES_RE='^Closes: [0-9]+(, [0-9]+)*$'

check_message() {  # $1 = label, stdin = full message (comments already stripped)
  local label="$1" msg header fails=0
  msg="$(grep -v '^#' | sed -e 's/[[:space:]]*$//')"
  header="$(printf '%s\n' "$msg" | grep -m1 -v '^$')"
  case "$header" in
    "Merge "*|"Revert "*|"fixup! "*|"squash! "*|"amend! "*) return 0 ;;
  esac
  if ! printf '%s' "$header" | grep -Eq "$HEADER_RE"; then
    echo "$label: header must be \`type(scope): subject\` with type in {${TYPES//|/,}} — got: $header"; fails=1
  fi
  if [ "${#header}" -gt 200 ]; then echo "$label: header is ${#header} chars (max 200)"; fails=1; fi
  local rest; rest="$(printf '%s\n' "$msg" | grep -v '^$' | tail -n +2)"
  local trailers; trailers="$(printf '%s\n' "$rest" | grep -i '^Co-Authored-By:' || true)"
  if [ -z "$trailers" ]; then
    if [ "${ORB_HUMAN_COMMIT:-0}" != "1" ]; then
      echo "$label: no \`Co-Authored-By: Name <local@domain>\` trailer (an owner hand-commit sets ORB_HUMAN_COMMIT=1)"; fails=1
    fi
  else
    while IFS= read -r t; do
      printf '%s' "$t" | grep -Eq "$TRAILER_RE" || { echo "$label: malformed trailer (address must be <local@domain>, no spaces): $t"; fails=1; }
    done <<< "$trailers"
  fi
  local closes; closes="$(printf '%s\n' "$rest" | grep -i '^Closes:' || true)"
  if [ -n "$closes" ]; then
    while IFS= read -r c; do
      printf '%s' "$c" | grep -Eq "$CLOSES_RE" || { echo "$label: malformed Closes trailer (expected \`Closes: 12, 14\` — work-item ids, comma-separated): $c"; fails=1; }
    done <<< "$closes"
  fi
  return $fails
}

case "${1:-}" in
  --range)
    rc=0
    for sha in $(git rev-list --no-merges "${2:?usage: --range <rev-range>}"); do
      git log -1 --format=%B "$sha" | check_message "$(git log -1 --format=%h "$sha")" || rc=1
    done
    [ $rc -eq 0 ] && echo "commit-msg-check: $(git rev-list --no-merges --count "$2") commit(s) in $2 conform"
    exit $rc ;;
  -h|--help|"") sed -n '2,11p' "$0"; exit 2 ;;
  *)
    check_message "commit-msg" < "$1" || { echo "commit-msg-check: refused. Rules: scripts/commit-msg-check.sh --help"; exit 1; }
    exit 0 ;;
esac

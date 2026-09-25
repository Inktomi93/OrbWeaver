#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): a fast advisory over the checkout that owns the edited file.
# Biome and dep-cruiser stay file-scoped; TypeScript checks the planner's native primary program(s).
# Exit 2 shows stderr to Claude after the tool ran. A tool error or skipped leg is a non-verdict.
set -uo pipefail
umask 077

notice_and_exit() {
  printf '── edit advisory was NOT completed ──\n%s\n' "$1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || notice_and_exit "jq is unavailable; hook input cannot be validated safely"
input=$(cat) || notice_and_exit "hook input could not be read"
if ! jq -e 'type == "object" and (.hook_event_name | type == "string") and (.tool_name | type == "string")' <<<"$input" >/dev/null 2>&1; then
  notice_and_exit "hook input is malformed: expected an object with string hook_event_name and tool_name"
fi
hook_event=$(jq -r '.hook_event_name' <<<"$input")
tool_name=$(jq -r '.tool_name' <<<"$input")
case "$hook_event:$tool_name" in
  PostToolUse:Edit|PostToolUse:Write|PostToolUse:MultiEdit) ;;
  *) exit 0 ;;
esac
if ! jq -e '(.cwd | type == "string" and length > 0) and (.tool_input | type == "object") and (.tool_input.file_path | type == "string" and length > 0)' <<<"$input" >/dev/null 2>&1; then
  notice_and_exit "hook input is malformed: a supported PostToolUse file event requires nonempty cwd and tool_input.file_path strings"
fi
file=$(jq -r '.tool_input.file_path' <<<"$input")
payload_cwd=$(jq -r '.cwd' <<<"$input")

project_dir="${CLAUDE_PROJECT_DIR:-}"
[ -z "$project_dir" ] && notice_and_exit "CLAUDE_PROJECT_DIR is unset; repository trust boundary cannot be established"

root=$(git -C "$payload_cwd" rev-parse --show-toplevel 2>/dev/null) || notice_and_exit "hook cwd is not inside a Git checkout: $payload_cwd"
project_root=$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null) || notice_and_exit "CLAUDE_PROJECT_DIR is not inside a Git checkout: $project_dir"
root=$(realpath -- "$root") || notice_and_exit "checkout root cannot be resolved: $root"
project_root=$(realpath -- "$project_root") || notice_and_exit "project root cannot be resolved: $project_root"
root_common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || notice_and_exit "checkout Git common directory cannot be resolved"
project_common=$(git -C "$project_root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || notice_and_exit "project Git common directory cannot be resolved"
root_common=$(realpath -- "$root_common") || notice_and_exit "checkout Git common directory cannot be canonicalized"
project_common=$(realpath -- "$project_common") || notice_and_exit "project Git common directory cannot be canonicalized"
[ "$root_common" = "$project_common" ] || notice_and_exit "hook cwd belongs to a different repository than CLAUDE_PROJECT_DIR"

# Lexical normalization only (-s: do not follow symlinks): the containment test below must see the path as
# WRITTEN, so a symlink planted inside the checkout that points outside is judged by the resolving arm that
# follows it, not silently waved through as an outside path.
case "$file" in
  /*) file_abs=$(realpath -m -s -- "$file") ;;
  *) file_abs=$(realpath -m -s -- "$payload_cwd/$file") ;;
esac
# A file outside the checkout (a scratchpad note, a bridge message, a /tmp probe) is not repository code:
# there is nothing here to lint, so this is a silent no-op, not a non-verdict (owner, 2026-09-11 — the
# old exit-2 notice fired on every scratchpad Write and read as an error). A path that LOOKS inside but
# RESOLVES outside is the symlink-escape case below and stays a refusal.
case "$file_abs" in
  "$root"/*) ;;
  *) exit 0 ;;
esac
if [ -e "$file_abs" ]; then
  file_target=$(realpath -- "$file_abs") || notice_and_exit "edited path cannot be resolved: $file_abs"
  case "$file_target" in
    "$root"/*) ;;
    *) notice_and_exit "edited path resolves outside the active checkout: $file_abs" ;;
  esac
fi
rel="${file_abs#"$root/"}"
# Only code and config have a verdict here: Biome skips markdown, and a typecheck plan for a prose file
# costs a pool slot and a pnpm spawn for nothing.
case "$rel" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css) ;;
  *) exit 0 ;;
esac
cd "$root" || notice_and_exit "active checkout cannot be entered: $root"

profile="$root/tooling/concurrency-profile.json"
[ -f "$profile" ] || notice_and_exit "missing concurrency profile: $profile"
case "${ORB_DEDICATED_BOX:-}" in
  ""|0) profile_name="shared" ;;
  1) profile_name="dedicated" ;;
  *) notice_and_exit "ORB_DEDICATED_BOX must be unset/0 (shared) or 1 (dedicated)" ;;
esac
profile_num() {
  jq -er --arg profile "$profile_name" --arg field "$1" '.profiles[$profile][$field] | select(type == "number" and floor == . and . >= 1)' "$profile" 2>/dev/null
}
slots=$(profile_num hookPoolSlots) || notice_and_exit "concurrency profile has no positive integer $profile_name.hookPoolSlots"
ts7_checkers=$(profile_num hookTs7Checkers) || notice_and_exit "concurrency profile has no positive integer $profile_name.hookTs7Checkers"

tempdir=$(mktemp -d) || notice_and_exit "temporary workspace could not be created"
bout="$tempdir/biome.out"
berr="$tempdir/biome.err"
dout="$tempdir/depcruise.out"
derr="$tempdir/depcruise.err"
djson="$tempdir/depcruise.payload.json"
tout="$tempdir/typecheck.out"
diag="$tempdir/non-verdict.out"
plan_out="$tempdir/plan.out"
plan_err="$tempdir/plan.err"
plan_json="$tempdir/plan.payload.json"
program_out="$tempdir/program.out"
trap 'rm -f "$bout" "$berr" "$dout" "$derr" "$djson" "$tout" "$diag" "$plan_out" "$plan_err" "$plan_json" "$program_out"; rmdir "$tempdir" 2>/dev/null || true' EXIT

# Every machine-readable leg below is launched through `pnpm exec`, and pnpm prints its OWN
# install/prepare reporting on STDOUT above the wrapped command's output whenever it decides the store
# needs verifying. Measured 2026-09-12 in a lane worktree: `Scope: all 9 workspace projects … .
# prepare$ lefthook install … Done in 1.6s using pnpm v11.15.1` arrived above well-formed planner JSON,
# `jq` refused the whole capture, and the typecheck leg was SKIPPED behind a line that reads like noise —
# a FAIL-OPEN in the advisory every lane leans on. So the hook parses the PAYLOAD, never the stream: the
# payload of a `--json` child begins at the first line that opens a JSON object, and an absent payload is
# a loud non-verdict, never a pass. stderr is captured separately for the same reason — a stream that is
# parsed must carry only what the parsed tool wrote.
json_payload() {
  sed -n '/^{/,$p' -- "$1"
}

# This UID-private pool is the hook's shared admission control across checkouts. The predictable old
# `/tmp/orb-hook-pool` path was unsafe: another UID could precreate a slot symlink and `>` would truncate
# its target before flock ran. The directory and every lock are validated before append-only opens.
pool_parent="${XDG_RUNTIME_DIR:-/tmp}"
if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
  [ ! -L "$pool_parent" ] || notice_and_exit "hook runtime directory must not be a symlink: $pool_parent"
  runtime_meta=$(stat -c '%u:%a:%F' -- "$pool_parent" 2>/dev/null) || notice_and_exit "hook runtime directory cannot be inspected: $pool_parent"
  [ "$runtime_meta" = "$EUID:700:directory" ] || notice_and_exit "hook runtime directory must be an owned mode-0700 directory: $pool_parent ($runtime_meta)"
fi
pooldir="$pool_parent/orb-hook-pool-$EUID"
[ ! -L "$pooldir" ] || notice_and_exit "hook admission directory must not be a symlink: $pooldir"
if ! mkdir -m 700 -- "$pooldir" 2>/dev/null && [ ! -d "$pooldir" ]; then
  notice_and_exit "hook admission directory cannot be created: $pooldir"
fi
pool_meta=$(stat -c '%u:%a:%F' -- "$pooldir" 2>/dev/null) || notice_and_exit "hook admission directory cannot be inspected: $pooldir"
[ "$pool_meta" = "$EUID:700:directory" ] || notice_and_exit "hook admission directory must be an owned mode-0700 directory: $pooldir ($pool_meta)"

secure_lock_file() {
  local path="$1" meta
  [ ! -L "$path" ] || return 1
  if [ ! -e "$path" ]; then
    : >>"$path" || return 1
    chmod 600 -- "$path" || return 1
  fi
  [ -f "$path" ] || return 1
  meta=$(stat -c '%u:%a' -- "$path" 2>/dev/null) || return 1
  [ "$meta" = "$EUID:600" ]
}
for slot in $(seq 1 "$slots"); do
  secure_lock_file "$pooldir/slot.$slot.lock" || notice_and_exit "hook admission lock is not an owned mode-0600 regular file: $pooldir/slot.$slot.lock"
done

take_pool_slot() {
  local name="$1" slot
  for slot in $(seq 1 "$slots"); do
    exec {pool_fd}>>"$pooldir/slot.$slot.lock" || continue
    if flock -n "$pool_fd"; then
      return 0
    fi
    exec {pool_fd}>&-
  done
  printf 'pool: all %s shared slots busy; %s was SKIPPED\n' "$slots" "$name" >>"$diag"
  return 1
}

(
  take_pool_slot biome || exit 0
  nice -n 10 pnpm exec biome check --config-path="$root/tooling/biome.edit.jsonc" --reporter=concise \
    --diagnostic-level=error --max-diagnostics=20 --no-errors-on-unmatched "$rel"
) >"$bout" 2>"$berr" &
bpid=$!

dpid=""
if [[ "$rel" == packages/* && "$rel" =~ \.(ts|tsx|js|jsx|mts|cts)$ && -f "$root/.dependency-cruiser.cjs" ]]; then
  (
    take_pool_slot depcruise || exit 0
    nice -n 10 pnpm exec depcruise "$rel" --config "$root/.dependency-cruiser.cjs" --output-type json
  ) >"$dout" 2>"$derr" &
  dpid=$!
fi

(
  take_pool_slot typecheck || exit 0
  if ! nice -n 10 pnpm exec node tooling/src/verify/cli.ts typecheck-plan --primary --file --json -- "$rel" >"$plan_out" 2>"$plan_err"; then
    printf 'typecheck planner failed for %s:\n' "$rel" >>"$diag"
    sed -n '1,80p' "$plan_out" >>"$diag"
    sed -n '1,80p' "$plan_err" >>"$diag"
    exit 0
  fi
  json_payload "$plan_out" >"$plan_json"
  if [ ! -s "$plan_json" ]; then
    printf 'typecheck planner printed no JSON payload on stdout for %s:\n' "$rel" >>"$diag"
    sed -n '1,80p' "$plan_out" >>"$diag"
    sed -n '1,80p' "$plan_err" >>"$diag"
    exit 0
  fi
  type_required=false
  case "$rel" in
    *.ts|*.tsx|*.mts|*.cts) type_required=true ;;
  esac
  if ! jq -e --arg path "$rel" --argjson type_required "$type_required" '
    .coverage == "advisory-primary-programs"
    and (.programs | type == "array")
    and all(.programs[]; type == "string" and length > 0)
    and (.subjects | type == "array" and length == 1)
    and (.subjects[0].path == $path)
    and (.subjects[0].selectedPrograms | type == "array")
    and all(.subjects[0].selectedPrograms[]; type == "string" and length > 0)
    and (
      if $type_required or .subjects[0].disposition == "selected" then
        .subjects[0].disposition == "selected"
        and (.programs | length > 0)
        and .programs == .subjects[0].selectedPrograms
      else
        .subjects[0].disposition == "not-applicable"
        and (.programs | length == 0)
        and (.subjects[0].selectedPrograms | length == 0)
      end
    )
  ' "$plan_json" >/dev/null 2>&1; then
    printf 'typecheck planner returned malformed output for %s\n' "$rel" >>"$diag"
    sed -n '1,80p' "$plan_out" >>"$diag"
    exit 0
  fi
  while IFS= read -r program; do
    [ -z "$program" ] && continue
    case "/$program/" in
      //*|*\\*|*/../*|*/./*)
        printf 'typecheck planner returned an unsafe program path: %s\n' "$program" >>"$diag"
        continue
        ;;
    esac
    if ! lock_key=$(printf '%s\0%s' "$root" "$program" | sha256sum | cut -d' ' -f1); then
      printf 'typecheck: could not derive the duplicate-suppression key for %s\n' "$program" >>"$diag"
      continue
    fi
    type_lock="$pooldir/typecheck.$lock_key.lock"
    if ! secure_lock_file "$type_lock"; then
      printf 'typecheck: duplicate-suppression lock is not an owned mode-0600 regular file for %s\n' "$program" >>"$diag"
      continue
    fi
    exec {type_fd}>>"$type_lock" || {
      printf 'typecheck: duplicate-suppression lock could not be opened for %s\n' "$program" >>"$diag"
      continue
    }
    if ! flock -n "$type_fd"; then
      printf 'typecheck: %s is already running for this checkout; it was SKIPPED\n' "$program" >>"$diag"
      exec {type_fd}>&-
      continue
    fi
    ORB_TS7_ADMISSION=try nice -n 10 pnpm exec node "$root/scripts/ts7.ts" --noEmit --pretty false --checkers "$ts7_checkers" -p "$program" >"$program_out" 2>&1
    program_rc=$?
    if [ "$program_rc" -eq 75 ]; then
      printf 'typecheck: %s was SKIPPED — every host typecheck slot is busy\n' "$program" >>"$diag"
    elif [ "$program_rc" -ne 0 ]; then
      if grep -Eq '\.(ts|tsx|mts|cts)\([0-9]+,[0-9]+\): error TS[0-9]+' "$program_out"; then
        printf '── %s ──\n' "$program" >>"$tout"
        cat "$program_out" >>"$tout"
      else
        printf 'typecheck compiler failed for %s (exit %s):\n' "$program" "$program_rc" >>"$diag"
        sed -n '1,80p' "$program_out" >>"$diag"
      fi
    fi
    rm -f "$program_out"
    exec {type_fd}>&-
  done < <(jq -r '.programs[]' "$plan_json")
) &
tpid=$!

wait "$bpid"; brc=$?
drc="not-run"
if [ -n "$dpid" ]; then wait "$dpid"; drc=$?; fi
wait "$tpid"; trc=$?

# biome's concise reporter writes its DIAGNOSTICS on stderr and its counting summary on stdout (measured
# 2026-09-12 against this checkout's pinned biome), and pnpm's wrapper reporting shares that stdout. So
# the diagnostic block is built from stderr alone: a future reporter that moves the diagnostics to stdout
# does not silently blank the block, it takes the named non-verdict arm below.
biome_f=""
if [ "$brc" -eq 1 ]; then
  if grep -Fq "$rel:" "$berr"; then
    biome_f=$(grep -vE '^(Checked |Found |check )|Some errors were emitted|^[[:space:]]*$' "$berr" || true)
  elif grep -Fq "$rel:" "$bout"; then
    printf 'biome reported %s on stdout, not stderr; its reporter contract changed and the lint block was NOT built:\n' "$rel" >>"$diag"
    sed -n '1,80p' "$bout" >>"$diag"
  else
    printf 'biome failed without a diagnostic for %s (exit 1):\n' "$rel" >>"$diag"
    sed -n '1,80p' "$berr" >>"$diag"
    sed -n '1,80p' "$bout" >>"$diag"
  fi
elif [ "$brc" -ne 0 ]; then
  printf 'biome failed as a tool (exit %s):\n' "$brc" >>"$diag"
  sed -n '1,80p' "$berr" >>"$diag"
  sed -n '1,80p' "$bout" >>"$diag"
fi

dep_f=""
if [ "$drc" = "0" ] || [ "$drc" = "1" ]; then
  json_payload "$dout" >"$djson"
  if ! jq -e '
    (.summary | type == "object")
    and (.summary.violations | type == "array")
    and all(.summary.violations[]; (.rule | type == "object") and (.rule.name | type == "string" and length > 0) and (.rule.severity | type == "string"))
  ' "$djson" >/dev/null 2>&1; then
    printf 'dep-cruiser returned malformed or empty JSON (exit %s):\n' "$drc" >>"$diag"
    sed -n '1,80p' "$dout" >>"$diag"
    sed -n '1,80p' "$derr" >>"$diag"
  else
    actionable=$(jq '[.summary.violations[] | select(.rule.name != "no-orphans" and .rule.severity == "error")] | length' "$djson")
    if [ "$actionable" -gt 0 ]; then
      dep_f=$(jq -r '
        .summary as $summary
        | $summary.violations[]
        | select(.rule.name != "no-orphans" and .rule.severity == "error")
        | . as $violation
        | ([$summary.ruleSetUsed.forbidden[]? | select(.name == $violation.rule.name) | .comment][0] // "rule comment unavailable") as $comment
        | "\($violation.from // "<unknown>") → \($violation.to // "<unknown>") [\($violation.rule.name)]\n    \($comment)"
      ' "$djson")
    elif [ "$drc" = "1" ] && ! jq -e '.summary.violations | length > 0 and all(.[]; .rule.name == "no-orphans")' "$djson" >/dev/null 2>&1; then
      printf 'dep-cruiser exited 1 without an actionable or explicitly excluded no-orphans violation:\n' >>"$diag"
      sed -n '1,80p' "$dout" >>"$diag"
    fi
  fi
elif [ "$drc" != "0" ] && [ "$drc" != "not-run" ]; then
  printf 'dep-cruiser failed as a tool (exit %s):\n' "$drc" >>"$diag"
  sed -n '1,80p' "$dout" >>"$diag"
fi
[ "$trc" -eq 0 ] || printf 'typecheck worker failed unexpectedly (exit %s)\n' "$trc" >>"$diag"

[ -z "$biome_f" ] && [ -z "$dep_f" ] && [ ! -s "$tout" ] && [ ! -s "$diag" ] && exit 0

{
  if [ -n "$biome_f" ]; then
    printf '── biome (lint) ──\n%s\n' "$biome_f"
  fi
  if [ -n "$dep_f" ]; then
    [ -n "$biome_f" ] && echo
    printf '── dep-cruiser (imports) ──\n%s\n' "$dep_f"
  fi
  if [ -s "$tout" ]; then
    { [ -n "$biome_f" ] || [ -n "$dep_f" ]; } && echo
    # Group TS errors by code, show basename + line positions. Saves ~1-2KB context per error
    # vs the full expanded generic types. Full output stays in $tout.
    grep -E '^── ' "$tout"
    # POSIX grep -E and awk only: macOS ships BSD grep (no -P) and Debian ships mawk (no match() arrays).
    grep -oE '[^/]+\([0-9]+,[0-9]+\): error TS[0-9]+: .{0,60}' "$tout" \
      | awk -F'[():]' '{
          file=$1; line=$2; col=$3; code=""; msg=""
          if (match($0, /error TS[0-9]+: /)) {
            code=substr($0, RSTART + 6, RLENGTH - 8); msg=substr($0, RSTART + RLENGTH)
          }
          key=code" "msg
          files[key]=files[key] ? files[key]" "file":"line : file":"line
          counts[key]++
        }
        END {
          for (key in counts) {
            printf "%s (%d): %s\n", key, counts[key], files[key]
          }
        }' | sort
    total=$(grep -c 'error TS[0-9]\+:' "$tout" 2>/dev/null || echo 0)
    printf '── %s type error(s) ──\n' "$total"
  fi
  if [ -s "$diag" ]; then
    { [ -n "$biome_f" ] || [ -n "$dep_f" ] || [ -s "$tout" ]; } && echo
    printf '── checks without a verdict ──\n'
    cat "$diag"
  fi
} >&2
exit 2

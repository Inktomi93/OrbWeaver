#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): fast per-file gate on the just-edited file.
#   • Biome       — concise reporter, errors-only (warnings stay silent).
#   • dep-cruiser — layer-cake / tier-order backstop, err-long so the rule's WHY prints.
# Both are single-file and run in PARALLEL. tsc is deliberately NOT here: it can't be soundly
# file-scoped (it sees a file's imports but never its consumers, so it reads green on a project
# an edit just broke). The honest whole-graph typecheck stays in pre-push `pnpm check`.
# Exit 2 surfaces findings to Claude; a clean file exits 0 silently.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" || exit 0
rel="${file#"$root/"}"                       # normalize the (usually absolute) path to repo-relative
cfg=".dependency-cruiser.cjs"

bout=$(mktemp); dout=$(mktemp)
trap 'rm -f "$bout" "$dout"' EXIT

pnpm exec biome check --reporter=concise --diagnostic-level=error \
  --max-diagnostics=20 --no-errors-on-unmatched "$rel" >"$bout" 2>&1 &
bpid=$!

# dep-cruiser only understands TS/JS source under packages/ — skip configs, scripts, docs, etc.
dpid=""
if [[ "$rel" == packages/* && "$rel" =~ \.(ts|tsx|js|jsx|mts|cts)$ && -f "$cfg" ]]; then
  pnpm exec depcruise "$rel" --config "$cfg" --output-type err-long >"$dout" 2>&1 &
  dpid=$!
fi

wait "$bpid" || true
[ -n "$dpid" ] && wait "$dpid" || true

# Strip each tool's timing/summary footer; what survives is the actionable findings.
biome_f=$(grep -vE '^(Checked |Found |check )|Some errors were emitted|^[[:space:]]*$' "$bout" || true)
dep_f=$(grep -vE 'dependency violations|^[[:space:]]*$' "$dout" 2>/dev/null || true)

[ -z "$biome_f" ] && [ -z "$dep_f" ] && exit 0

{
  [ -n "$biome_f" ] && printf '%s\n' "$biome_f"
  if [ -n "$dep_f" ]; then
    [ -n "$biome_f" ] && echo
    printf '%s\n' "$dep_f"
  fi
} >&2
exit 2

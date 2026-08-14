#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): fast per-file gate on the just-edited file.
#   • Biome       — concise reporter, errors-only (warnings stay silent).
#   • dep-cruiser — layer-cake / tier-order backstop, err-long so the rule's WHY prints.
#   • tsgo        — TYPE errors in the file's OWNING tsconfig program (TS7 native, ~0.3–2.5s).
# All three are single-file/single-program and run in PARALLEL. The tsgo leg is the TS7 (native Go)
# compiler run project-scoped (`-p <owning tsconfig>`) — the compiler-sanctioned per-file mode (raw
# `tsc <file>` is a hard TS5112 error since TS 6). It sees the file's IN-PROGRAM consumers (strictly
# better than a single-file check) but NOT cross-PROGRAM consumers (a client file's use in the DOM-less
# graph) — that whole-truth check stays in `pnpm check`. Named the program explicitly, so a
# tests/**.tsx file is checked against its real owner (client/ui), never a wrong InferredProject.
# A hook-PRIVATE tsBuildInfoFile keeps this off the real lanes' caches. FAIL-SOFT: any tsgo tooling
# error is swallowed (a broken hook must never block an edit); only real type diagnostics surface.
# Exit 2 surfaces findings to Claude; a clean file exits 0 silently.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$PWD}"
# WORKTREE-CORRECT ROOT (2026-08-14, smalls-client lane find): CLAUDE_PROJECT_DIR always names the
# MAIN checkout, but lanes edit files in their own worktrees — running the tools from main against a
# foreign absolute path makes biome lose the monorepo config (package.json unfindable → the built-in
# default ruleset fires on lines nobody touched) and the rel-normalization below silently no-ops.
# Walk up from the FILE to the nearest checkout root (biome.json + package.json together only exist
# there); CLAUDE_PROJECT_DIR stays the fallback for paths outside any checkout.
d=$(dirname "$file")
while [ "$d" != "/" ]; do
  if [ -f "$d/biome.json" ] && [ -f "$d/package.json" ]; then root="$d"; break; fi
  d=$(dirname "$d")
done
cd "$root" || exit 0
rel="${file#"$root/"}"                       # normalize the (usually absolute) path to repo-relative
cfg=".dependency-cruiser.cjs"

# ── the owning-tsconfig resolver (mirror of scripts/verify/selection.ts `staticPrograms`, rules 1–4) ──
# Prints the PRIMARY owning tsconfig for `rel`, or "" if the file is in no TS program (md/css/sh/config).
# A NODE package's src is also a graph root, but the hook checks the one owning PACKAGE program (fast,
# whole-program-honest); the DOM-less graph lens stays in `pnpm check`.
owning_tsconfig() {
  local p="$1"
  case "$p" in
    *.ts|*.tsx|*.mts|*.cts) ;;               # a TS source file — continue
    *) echo ""; return ;;                     # everything else is in no TS program
  esac
  # 1. package source → its own package config.
  if [[ "$p" =~ ^packages/([^/]+)/src/ ]]; then
    echo "packages/${BASH_REMATCH[1]}/tsconfig.json"; return
  fi
  # 2. client's vite.config.ts (named in client's include).
  if [[ "$p" == "packages/client/vite.config.ts" ]]; then
    echo "packages/client/tsconfig.json"; return
  fi
  # 3. the browser reach-back trees (owned WITH dom by a NON-ancestor config — the editor blind spot).
  if [[ "$p" =~ ^tests/client/.*\.tsx$ || "$p" == "tests/support/ct/ct-data-providers.tsx" ]]; then
    echo "packages/client/tsconfig.json"; return
  fi
  if [[ "$p" =~ ^tests/ui/.*\.tsx$ || ( "$p" =~ ^tests/support/ct/.*\.tsx$ && "$p" != "tests/support/ct/ct-data-providers.tsx" ) || "$p" =~ ^playwright/.*\.(tsx|d\.ts)$ ]]; then
    echo "packages/ui/tsconfig.json"; return
  fi
  # 4. the node graph roots (tests/·scripts/·reset.d.ts — .ts/.mts/.cts; a reach-back .tsx was claimed above).
  if [[ "$p" =~ ^tests/ || "$p" =~ ^scripts/ || "$p" == "reset.d.ts" ]]; then
    echo "tsconfig.json"; return
  fi
  echo ""
}

bout=$(mktemp); dout=$(mktemp); tout=$(mktemp)
trap 'rm -f "$bout" "$dout" "$tout"' EXIT

# nice'd + POOL-LIMITED: under a multi-agent swarm dozens of these run concurrently, and each
# single-file biome check pays whole-project module-graph resolution (~400% CPU) — they must lose
# the scheduler race to interactive work AND be capped. 4 flock slots; all busy ⇒ skip (fail-soft;
# the next edit or `pnpm check` catches it).
pooldir="$root/node_modules/.cache/hook-pool"
mkdir -p "$pooldir"
pool_run() { # pool_run <name> <cmd...>: try slots 1-4, else skip
  local name="$1"; shift
  for slot in 1 2 3 4; do
    # -E 99: flock's OWN busy-exit is 99, so the command's exit code (biome exits 1 on findings!)
    # passes through unambiguously — busy ⇒ try the next slot; anything else ⇒ the command ran.
    nice -n 10 flock -n -E 99 "$pooldir/$name.$slot.lock" "$@"
    local rc=$?
    [ "$rc" -ne 99 ] && return "$rc"
  done
  return 0 # all slots busy — skip (fail-soft)
}
pool_run biome pnpm exec biome check --reporter=concise --diagnostic-level=error \
  --max-diagnostics=20 --no-errors-on-unmatched "$rel" >"$bout" 2>&1 &
bpid=$!

# dep-cruiser only understands TS/JS source under packages/ — skip configs, scripts, docs, etc.
dpid=""
if [[ "$rel" == packages/* && "$rel" =~ \.(ts|tsx|js|jsx|mts|cts)$ && -f "$cfg" ]]; then
  pnpm exec depcruise "$rel" --config "$cfg" --output-type err-long >"$dout" 2>&1 &
  dpid=$!
fi

# tsgo TYPE leg — the file's owning program, TS7 native, hook-private buildinfo. Resolve the bin directly
# (never `pnpm exec` — its ~0.3s startup blows the budget). Skip if the file is in no TS program or tsgo
# isn't installed. Runs in parallel with biome/depcruise.
tpid=""
owner=$(owning_tsconfig "$rel")
tsgo_bin="$root/node_modules/.bin/tsgo"
if [[ -n "$owner" && -x "$tsgo_bin" && -f "$root/$owner" ]]; then
  tbi="$root/node_modules/.cache/hook-tsgo/${owner//\//_}.tsbuildinfo"
  mkdir -p "$(dirname "$tbi")"
  # PER-PROGRAM LOCK (flock -n): under a multi-agent swarm, concurrent tsgo runs on the SAME
  # tsconfig share one tsBuildInfoFile and thrash each other's incremental cache — every run
  # degrades to a near-full check and the overlap snowballs (measured: load avg 120+). If a run
  # for this program is already in flight, SKIP the type leg (the fail-soft doctrine above; the
  # full lanes in `pnpm check` remain the whole-truth gate).
  tlock="$root/node_modules/.cache/hook-tsgo/${owner//\//_}.lock"
  flock -n "$tlock" nice -n 10 "$tsgo_bin" --noEmit --pretty false --incremental \
    --tsBuildInfoFile "$tbi" -p "$owner" >"$tout" 2>&1 &
  tpid=$!
fi

wait "$bpid" || true
[ -n "$dpid" ] && wait "$dpid" || true
# Reap the tsgo child; its exit code is intentionally IGNORED — the diagnostic-line match below is the
# sole gate (tsgo exits 1 for tooling errors too, so exit code is no type-vs-tooling signal).
[ -n "$tpid" ] && wait "$tpid" || true

# Strip each tool's timing/summary footer; what survives is the actionable findings.
biome_f=$(grep -vE '^(Checked |Found |check )|Some errors were emitted|^[[:space:]]*$' "$bout" || true)
# no-orphans is excluded here (BLOCK-wise — header + its indented err-long body): a SINGLE-file
# cruise has no importers by construction, so the rule false-fires on every zero-import leaf file.
# The whole-graph `pnpm depcruise` is its real home.
dep_f=$(awk '/no-orphans/{skip=1;next} skip&&/^[[:space:]]/{next} {skip=0} !/dependency violations/&&NF' "$dout" 2>/dev/null || true)

# tsgo: surface ONLY a genuine type diagnostic for the EDITED file. Exit code is deliberately NOT consulted
# — tsgo exits 1 for tooling failures too (missing/malformed project, IO/write errors), so it can't tell
# "type error" from "tool broke". The diagnostic-line regex + `$rel` filter IS the sole gate: any config /
# IO / crash failure emits no `path(line,col): error TS` line for the edited file → tsgo_f is empty →
# silent. By construction the hook can ONLY fire on a real type error in the file you just edited — never
# tooling noise, never a sibling file's error, never on tsgo's own breakage.
tsgo_f=$(grep -E '\.(ts|tsx|mts|cts)\([0-9]+,[0-9]+\): error TS' "$tout" 2>/dev/null | grep -F "$rel" || true)

[ -z "$biome_f" ] && [ -z "$dep_f" ] && [ -z "$tsgo_f" ] && exit 0

# Grouped like `pnpm verify`: a labelled header per non-empty tool block, blank-line separated, so a
# reader (and the agent) sees WHICH tool flagged WHAT at a glance. Diagnostic lines stay unindented so
# their `path:line:col` / `path(line,col)` anchors stay click-navigable.
{
  [ -n "$biome_f" ] && { printf '── biome (lint) ──\n'; printf '%s\n' "$biome_f"; }
  if [ -n "$dep_f" ]; then
    [ -n "$biome_f" ] && echo
    printf '── dep-cruiser (imports) ──\n'
    printf '%s\n' "$dep_f"
  fi
  if [ -n "$tsgo_f" ]; then
    { [ -n "$biome_f" ] || [ -n "$dep_f" ]; } && echo
    printf '── tsgo (types) ──\n'
    printf '%s\n' "$tsgo_f"
  fi
} >&2
exit 2

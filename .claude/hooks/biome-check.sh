#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): fast per-file gate on the just-edited file. THREE legs, in parallel:
#   • Biome       — concise reporter, errors-only (warnings stay silent).
#   • dep-cruiser — layer-cake / tier-order backstop, err-long so the rule's WHY prints.
#   • ts7         — TYPE errors in the file's OWNING tsconfig program (TS7 native, ~0.3-2.5s).
# Exit 2 surfaces findings to Claude; a clean file exits 0 silently. A block whose finding text has no
# VISIBLE content prints a self-diagnosis receipt instead of a bare banner (#498) — see that arm below.
#
# THE TS LEG WAS DEAD AND IS NOW REPAIRED (#1835, 2026-09-06). It only ever ran when
# `node_modules/.bin/tsgo` existed, and the TS7 migration removed that bin — so the owning-tsconfig
# resolver, the per-program lock and the buildinfo cache sat here executing NOTHING, silently, for months.
# It now runs the same wrapper every other type floor runs, `scripts/ts7.cjs` (which also carries the
# 16GB heap floor a bare `node` invocation does not get). The leg is still project-scoped
# (`-p <owning tsconfig>`) — the compiler-sanctioned per-file mode, since a raw `tsc <file>` is a hard
# TS5112 error in TS 6+. It sees the file's IN-PROGRAM consumers (strictly better than a single-file
# check) but NOT cross-PROGRAM consumers (a client file's use in the DOM-less graph); that whole-truth
# check stays in `pnpm check`. The program is named EXPLICITLY, so a tests/**.tsx file is checked against
# its real owner (client/ui), never a wrong InferredProject. A hook-PRIVATE tsBuildInfoFile keeps this off
# the real lanes' caches. FAIL-SOFT: any ts7 tooling error is swallowed (a broken hook must never block an
# edit); only real type diagnostics surface.
#
# EVERY CAP HERE IS HOST-WIDE NOW, and that is the whole #1835 fix. The pool used to live in
# `<root>/node_modules/.cache/`, i.e. one pool PER WORKTREE — so six lanes across two accounts held up to
# 24 biome slots between them and the "4-slot pool" capped nothing; 14h of Prometheus measured the result
# (node_load1 105.8 on 24 cores, PSI cpu 0.6, the co-hosted homelab starved). Both host-wide mechanisms
# live under `$XDG_RUNTIME_DIR`, which is per-USER and therefore shared by every worktree and both
# accounts on this box:
#   • ONE SHARED SLOT POOL for the two FILE-SCOPED legs (biome + dep-cruiser). They contend for the same
#     N locks, because they cost the same thing — each pays whole-project module-graph resolution for one
#     file (~400% CPU) — and a per-leg pool would just be two caps that add up. N = `hookPoolSlots` from
#     tooling/concurrency-profile.json. dep-cruiser used to run at FULL PRIORITY and OUTSIDE the pool
#     entirely; it is now niced and pooled like everything else.
#   • ONE PER-PROGRAM LOCK for the WHOLE-PROGRAM ts leg, also host-wide. Concurrent ts7 runs on the SAME
#     tsconfig share one tsBuildInfoFile and thrash each other's incremental cache — every run degrades to
#     a near-full check and the overlap snowballs (measured: load avg 120+). Non-blocking: if a run for
#     this program is in flight ANYWHERE ON THE BOX, this leg SKIPS. The buildinfo file itself stays
#     PER-WORKTREE, because it keys that tree's own sources — sharing it across trees would be the cache
#     corruption the lock exists to prevent.
# All three legs ride `nice -n 10`: they must lose the scheduler race to interactive work.
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

# ── the concurrency profile (tooling/concurrency-profile.json — the ONE home for every cap) ─────────
# Every failure mode falls back to the caller's default rather than refusing: a hook that dies because a
# JSON file moved is a hook that blocks every edit on the box.
profile_num() { # profile_num <key> <fallback>
  local key="$1" fallback="$2" want profile_key
  local profile="$root/tooling/concurrency-profile.json"
  [ -f "$profile" ] || { printf '%s' "$fallback"; return; }
  command -v jq >/dev/null 2>&1 || { printf '%s' "$fallback"; return; }
  profile_key="shared"; [ "${ORB_DEDICATED_BOX:-}" = "1" ] && profile_key="dedicated"
  want=$(jq -r --arg k "$profile_key" --arg f "$key" '.profiles[$k][$f] // empty' "$profile" 2>/dev/null || true)
  case "$want" in
    ''|*[!0-9]*) printf '%s' "$fallback" ;;   # absent or not a bare integer ⇒ the fallback
    *) if [ "$want" -ge 1 ]; then printf '%s' "$want"; else printf '%s' "$fallback"; fi ;;
  esac
}
slots=$(profile_num hookPoolSlots 4)
ts7_checkers=$(profile_num hookTs7Checkers 2)

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

bout=$(mktemp); dout=$(mktemp); tout=$(mktemp); diag=$(mktemp)
trap 'rm -f "$bout" "$dout" "$tout" "$diag"' EXIT

# HOST-WIDE, not per-checkout: $XDG_RUNTIME_DIR is per-user (/run/user/<uid>), so every worktree and both
# accounts contend for the SAME N locks. /tmp is the fallback for a shell with no runtime dir (a cron/ssh
# context), and it is host-wide too.
pooldir="${XDG_RUNTIME_DIR:-/tmp}/orb-hook-pool"
mkdir -p "$pooldir"
pool_run() { # pool_run <name> <cmd...>: take any of the N SHARED slots, else skip
  local name="$1"; shift
  local slot
  for slot in $(seq 1 "$slots"); do
    # The lock file is named by SLOT, not by leg: biome and dep-cruiser share one pool, so two legs on one
    # box compete for the same N locks rather than holding N each.
    # -E 99: flock's OWN busy-exit is 99, so the command's exit code (biome exits 1 on findings!)
    # passes through unambiguously — busy ⇒ try the next slot; anything else ⇒ the command ran.
    nice -n 10 flock -n -E 99 "$pooldir/slot.$slot.lock" "$@"
    local rc=$?
    [ "$rc" -ne 99 ] && return "$rc"
  done
  # All slots busy ⇒ skip (fail-soft). The skip is INDISTINGUISHABLE from success in the return code (both
  # 0 with an empty output file), so it is recorded for the self-diagnosis block: pool_run runs inside a
  # background subshell, so a shell variable could not carry this back — the note goes to a file.
  printf 'pool: all %s host-wide slots busy (%s) — the %s leg was SKIPPED (no output is expected from it)\n' "$slots" "$pooldir" "$name" >>"$diag"
  return 0
}
# THE PER-EDIT LEG RUNS UNDER tooling/biome.edit.jsonc, NOT THE ROOT CONFIG (#1850, 2026-09-06). Three
# PROJECT-domain rules in biome.json (noImportCycles / noPrivateImports / noUndeclaredDependencies) make
# every invocation crawl and parse the whole 7,230-file tree to build the module graph — measured 5 s /
# 25 CPU-s for ONE file on a quiet box, 18 s / 52 CPU-s under load, on EVERY save in EVERY lane. The edit
# config extends the root (same formatter, same file-local rules — a planted `var` + unused import still
# red) but turns the project domain off and tells the scanner to ignore the tree
# (`files.experimentalScannerIgnores`): 84 ms / ~1 CPU-s per file. The three graph rules are the whole-tree
# `lint:biome` verify stage's, which pays the crawl ONCE per run. `--skip` does NOT avoid the crawl and the
# daemon (`--use-server`) reported a fresh file as "Checked 0 files" and timed out from a worktree — both
# were measured and rejected.
pool_run biome pnpm exec biome check --config-path="$root/tooling/biome.edit.jsonc" --reporter=concise \
  --diagnostic-level=error --max-diagnostics=20 --no-errors-on-unmatched "$rel" >"$bout" 2>&1 &
bpid=$!

# dep-cruiser only understands TS/JS source under packages/ — skip configs, scripts, docs, etc. It shares
# the pool above; before #1835 it was the one leg that ran un-niced and uncapped.
dpid=""
if [[ "$rel" == packages/* && "$rel" =~ \.(ts|tsx|js|jsx|mts|cts)$ && -f "$cfg" ]]; then
  pool_run depcruise pnpm exec depcruise "$rel" --config "$cfg" --output-type err-long >"$dout" 2>&1 &
  dpid=$!
fi

# ts7 TYPE leg — the file's owning program, TS7 native, hook-private buildinfo. Runs through
# scripts/ts7.cjs (one home for the ts7 invocation AND the heap floor). `--checkers` is passed EXPLICITLY
# from the profile: ts7.cjs would inject its own batch default, and this leg fires on every edit beside
# whatever else is running, so it takes the smaller hook number. Skip if the file is in no TS program.
tpid=""
owner=$(owning_tsconfig "$rel")
ts7_wrapper="$root/scripts/ts7.cjs"
if [[ -n "$owner" && -f "$ts7_wrapper" && -f "$root/$owner" ]]; then
  # The buildinfo is PER-WORKTREE (it keys this tree's own sources); the LOCK is HOST-WIDE (a run for the
  # same program anywhere on the box would thrash the same incremental cache shape and pile CPU on).
  tbi="$root/node_modules/.cache/hook-tsgo/${owner//\//_}.tsbuildinfo"
  mkdir -p "$(dirname "$tbi")"
  tlock="$pooldir/ts7.$(printf '%s' "$root/$owner" | tr '/' '_').lock"
  ( flock -n -E 99 "$tlock" nice -n 10 node "$ts7_wrapper" --noEmit --pretty false --incremental \
      --checkers "$ts7_checkers" --tsBuildInfoFile "$tbi" -p "$owner"
    trc=$?
    if [ "$trc" -eq 99 ]; then
      printf 'ts7: a check of %s is already running on this box — the TYPE leg was SKIPPED (no output is expected from it)\n' "$owner" >>"$diag"
    fi
    exit "$trc" ) >"$tout" 2>&1 &
  tpid=$!
fi

# Each leg's exit code is CAPTURED (never `|| true`-discarded) purely so a block can explain itself —
# see the self-diagnosis arm below. No code path GATES on these: the finding text remains the sole gate,
# exactly as before. `set -e` is not in effect, so a non-zero `wait` cannot abort the hook.
wait "$bpid"; brc=$?
drc="not-run"
if [ -n "$dpid" ]; then wait "$dpid"; drc=$?; fi
# Reap the ts7 child; its exit code is intentionally NOT a gate — the diagnostic-line match below is the
# sole gate (ts7 exits 1 for tooling errors too, so exit code is no type-vs-tooling signal). Recorded
# for the diagnosis block only.
trc="not-run"
if [ -n "$tpid" ]; then wait "$tpid"; trc=$?; fi

# Strip each tool's timing/summary footer; what survives is the actionable findings.
biome_f=$(grep -vE '^(Checked |Found |check )|Some errors were emitted|^[[:space:]]*$' "$bout" || true)
# no-orphans is excluded here (BLOCK-wise — header + its indented err-long body): a SINGLE-file
# cruise has no importers by construction, so the rule false-fires on every zero-import leaf file.
# The whole-graph `pnpm depcruise` is its real home.
dep_f=$(awk '/no-orphans/{skip=1;next} skip&&/^[[:space:]]/{next} {skip=0} !/dependency violations/&&NF' "$dout" 2>/dev/null || true)

# ts7: surface ONLY a genuine type diagnostic for the EDITED file. Exit code is deliberately NOT consulted
# — ts7 exits 1 for tooling failures too (missing/malformed project, IO/write errors), so it can't tell
# "type error" from "tool broke". The diagnostic-line regex + `$rel` filter IS the sole gate: any config /
# IO / crash failure emits no `path(line,col): error TS` line for the edited file → tsgo_f is empty →
# silent. By construction the hook can ONLY fire on a real type error in the file you just edited — never
# tooling noise, never a sibling file's error, never on the compiler's own breakage.
tsgo_f=$(grep -E '\.(ts|tsx|mts|cts)\([0-9]+,[0-9]+\): error TS' "$tout" 2>/dev/null | grep -F "$rel" || true)

[ -z "$biome_f" ] && [ -z "$dep_f" ] && [ -z "$tsgo_f" ] && exit 0

# ── SELF-DIAGNOSIS (#498) ──────────────────────────────────────────────────────────────────────────
# This hook once blocked a Write having printed the biome + dep-cruiser BANNERS with ZERO findings under
# them, and could not be reproduced afterwards. The banner is printed per NON-EMPTY finding variable, and
# the all-empty case exits 0 above — so that block had a finding variable that was non-empty yet carried
# nothing a reader could see (whitespace/control bytes only: an ANSI-only line, a lone \r, a partially
# stripped footer). The cause is NOT known and is deliberately NOT guessed at here: the gate below is
# unchanged and still blocks, because silently downgrading to exit 0 would swallow a real finding whose
# only sin was an odd encoding. What changes is that the next occurrence carries its OWN receipt —
# per-stage exit codes, raw byte counts, and the raw bytes rendered with `cat -v` so invisible content
# becomes visible — instead of a bare banner nobody can act on.
# "Visible" = what survives stripping ANSI CSI sequences, then whitespace and control bytes. The ANSI
# strip is NOT redundant with `tr -d '[:cntrl:]'`: only the leading ESC of `\033[0m` is a control byte —
# `[0m` is printable ASCII, so a colour-code-only line reads as content to every byte-wise test while
# rendering as nothing at all. That was the shape a planted control reproduced.
# LC_ALL=C is LOAD-BEARING, not hygiene: `[@-~]` (the CSI final-byte range) matches NOTHING under this
# box's en_US.UTF-8 collation and everything under C — the strip silently no-op'd, and a no-op strip reads
# exactly like "there was nothing to strip". Verified both ways before this line was trusted.
visible=$(printf '%s%s%s' "$biome_f" "$dep_f" "$tsgo_f" \
  | LC_ALL=C sed -E 's/\x1b\[[0-9;?]*[@-~]//g' \
  | tr -d '[:space:][:cntrl:]')
if [ -z "$visible" ]; then
  {
    printf '── biome-check.sh SELF-DIAGNOSIS: blocked with no VISIBLE findings (#498) ──\n'
    printf 'The finding text below is non-empty but contains only whitespace/control bytes, so the\n'
    printf 'banners would have printed with nothing under them. Report this block on issue #498.\n\n'
    printf 'file : %s\n' "$rel"
    printf 'root : %s\n' "$root"
    printf 'owner: %s\n' "${owner:-<none — file is in no TS program>}"
    printf 'pool : %s slots at %s (host-wide)\n' "$slots" "$pooldir"
    printf 'exit codes  : biome=%s depcruise=%s ts7=%s   (0=clean 1=findings 2=config 99=pool/lock busy; not-run=leg skipped)\n' \
      "$brc" "$drc" "$trc"
    printf 'raw bytes   : biome=%s depcruise=%s ts7=%s\n' \
      "$(wc -c <"$bout")" "$(wc -c <"$dout")" "$(wc -c <"$tout")"
    printf 'post-filter : biome=%s dep=%s ts7=%s (chars surviving each tool filter)\n' \
      "${#biome_f}" "${#dep_f}" "${#tsgo_f}"
    [ -s "$diag" ] && cat "$diag"
    printf '\n── raw biome output (cat -v, first 2000 bytes) ──\n'
    head -c 2000 "$bout" | cat -v
    printf '\n── raw dep-cruiser output (cat -v, first 2000 bytes) ──\n'
    head -c 2000 "$dout" | cat -v
    printf '\n── raw ts7 output (cat -v, first 2000 bytes) ──\n'
    head -c 2000 "$tout" | cat -v
    printf '\n'
  } >&2
  exit 2
fi

# Grouped like `pnpm verify`: a labelled header per non-empty tool block, blank-line separated, so a
# reader (and the agent) sees WHICH tool flagged WHAT at a glance. Diagnostic lines stay unindented so
# their `path:line:col` / `path(line,col)` anchors stay click-navigable. A leg that was SKIPPED by the
# pool or the per-program lock says so here too — otherwise a blocked edit looks like a full verdict when
# two thirds of it never ran.
{
  [ -n "$biome_f" ] && { printf '── biome (lint) ──\n'; printf '%s\n' "$biome_f"; }
  if [ -n "$dep_f" ]; then
    [ -n "$biome_f" ] && echo
    printf '── dep-cruiser (imports) ──\n'
    printf '%s\n' "$dep_f"
  fi
  if [ -n "$tsgo_f" ]; then
    { [ -n "$biome_f" ] || [ -n "$dep_f" ]; } && echo
    printf '── ts7 (types) ──\n'
    printf '%s\n' "$tsgo_f"
  fi
  if [ -s "$diag" ]; then
    echo
    printf '── legs that did NOT run ──\n'
    cat "$diag"
  fi
} >&2
exit 2

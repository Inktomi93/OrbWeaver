#!/usr/bin/env bash
# ── isolated mutation-testing runner ─────────────────────────────────────────
#
#   pnpm test:mutation        → bash scripts/dev/mutation.sh stryker.config.json
#   pnpm test:mutation:gate   → bash scripts/dev/mutation.sh stryker.gate.config.json
#   (extra stryker args pass through: `pnpm test:mutation --mutate 'packages/kit/src/regex/**'`)
#
# WHY A DISPOSABLE COPY (not the working tree):
# StrykerJS's sandbox does NOT resolve workspace ALIAS imports (`@orb/*`, `#*`) into the sandbox — they
# escape to the original packages via the symlinked node_modules, so the mutant-instrumented code and the
# tests load TWO copies of every @orb/* module. `instanceof` then breaks and module-level singletons (the
# logger level, the OpenRouter catalog cache, …) split into two parallel universes → the initial test run
# fails. This is a documented StrykerJS limitation ("sandboxing does not support alias imports — it always
# imports from the local project instead of the sandbox"). The maintainers' fix is `--inPlace`: mutate the
# REAL files (no sandbox → exactly one copy of each module). But running `--inPlace` on THIS working tree
# would corrupt any other agent's edits/tests/builds while the run is live.
#
# So we rsync the repo to a throwaway copy and run `stryker --inPlace` THERE. The working tree is never
# mutated; the copy is the sacrificial one. pnpm's workspace links AND its .pnpm store links are all
# RELATIVE (`node_modules/@orb/contracts -> ../../packages/contracts`), so an rsync that preserves symlinks
# (`-a`) yields a SELF-CONSISTENT copy: the copy's node_modules resolves into the copy's own packages — no
# `pnpm install`, no native-rebuild, no lefthook/`prepare` (we exclude .git) needed.
#
# RESULTS + CLEANUP: the copy is PERSISTENT and incrementally re-synced (`--delete`), so only the first run
# pays the full ~2.1G node_modules copy; later runs sync just what changed (seconds), and Stryker's
# incremental cache rides along in reports/ both ways for fast re-runs. After the run (success OR a
# break-threshold failure) the `finish` trap copies the report + incremental cache back into the working
# tree's reports/ (the "proper place" the htmlReporter points at) and deletes the copy's transient sandbox
# + leaked per-worker setup files. Set ORB_MUTATION_WIPE=1 to delete the whole copy too (slower next run).
# Override the copy location with ORB_MUTATION_DIR.

set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DST="${ORB_MUTATION_DIR:-/tmp/orb-mutation}"
CONFIG="${1:-stryker.config.json}"

# Refuse a copy dir that IS or is INSIDE the working tree — `--inPlace` there would mutate real files.
case "$DST" in
  "$SRC" | "$SRC"/*)
    echo "mutation: ORB_MUTATION_DIR must be OUTSIDE the working tree ($SRC), got $DST" >&2
    exit 1
    ;;
esac

finish() {
  # Bring results into the working tree's reports/ even on a non-zero exit (e.g. break threshold).
  if [ -d "$DST/reports" ]; then
    mkdir -p "$SRC/reports"
    rsync -a "$DST/reports/" "$SRC/reports/" 2>/dev/null || true
  fi
  # Clean the copy's transient junk (sandbox + leaked setup files). Source + node_modules stay for fast
  # incremental re-runs unless a full wipe is requested.
  rm -rf "$DST/.stryker-tmp" "$DST"/stryker-setup-*.js 2>/dev/null || true
  [ "${ORB_MUTATION_WIPE:-0}" = "1" ] && rm -rf "$DST"
  return 0
}
trap finish EXIT

echo "mutation: syncing working tree → $DST (incremental; node_modules included, big caches excluded)…"
mkdir -p "$DST"
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.cache/' \
  --exclude '.models/' \
  --exclude '.stryker-tmp/' \
  --exclude 'coverage/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  --exclude '.claude/' \
  --exclude 'reference/' \
  --exclude 'scratch/' \
  "$SRC/" "$DST/" || { echo "mutation: rsync failed" >&2; exit 1; }

cd "$DST" || exit 1
echo "mutation: running stryker --inPlace inside the copy (your working tree is untouched)…"
# --inPlace is supplied HERE, never baked into the committed config — so a bare `stryker run` in the real
# repo can never mutate it in place.
# Belt-and-suspenders: --inPlace mutates the CWD's real files, so refuse unless CWD is the disposable copy.
# A broken cd/guard above can then NEVER let --inPlace loose in the working tree.
if [ "$PWD" != "$DST" ] || [ "$PWD" = "$SRC" ]; then
  echo "mutation: ABORT — cwd '$PWD' is not the disposable copy ($DST); refusing --inPlace" >&2
  exit 1
fi
node_modules/.bin/stryker run "$CONFIG" --inPlace "${@:2}"
status=$?
echo "mutation: report → $SRC/reports/mutation/  (exit $status)"
exit "$status"

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
# The copy is PERSISTENT and incrementally re-synced (`--delete`), so only the first run pays the full
# ~2.1G node_modules copy; later runs sync just what changed (seconds). Stryker's own incremental cache
# lives in the copy's reports/ and survives between runs too. Override the location with ORB_MUTATION_DIR.

set -euo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DST="${ORB_MUTATION_DIR:-/tmp/orb-mutation}"
CONFIG="${1:-stryker.config.json}"

if [ "$DST" = "$SRC" ]; then
  echo "mutation: ORB_MUTATION_DIR must NOT be the working tree ($SRC)" >&2
  exit 1
fi

echo "mutation: syncing working tree → $DST (incremental; node_modules included, caches excluded)…"
mkdir -p "$DST"
# Preserve symlinks (-a includes -l) so the relative workspace/.pnpm links stay valid in the copy. Exclude
# .git (no hooks/install needed), the multi-GB model/venv caches, and per-run output dirs.
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.cache/' \
  --exclude '.models/' \
  --exclude '.stryker-tmp/' \
  --exclude 'coverage/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  --exclude '.claude/' \
  "$SRC/" "$DST/"

cd "$DST"
echo "mutation: running stryker --inPlace inside the copy (your working tree is untouched)…"
# --inPlace is supplied HERE, never baked into the committed config — so a bare `stryker run` in the real
# repo can never mutate it in place.
node_modules/.bin/stryker run "$CONFIG" --inPlace "${@:2}"
status=$?
echo "mutation: done. HTML report → $DST/reports/mutation/"
exit "$status"

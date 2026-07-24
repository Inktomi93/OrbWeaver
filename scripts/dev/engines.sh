#!/usr/bin/env bash
# ── vLLM engine owner — thin shim over scripts/dev/engines.ts ─────────────────
#
#   pnpm engines
#
# The engine LAUNCH SPEC now lives in TS (scripts/dev/engines.ts → the SAME
# buildEngineSpawnSpec the in-server supervisor uses, so the two owners can never
# drift). This shim survives for ONE reason the TS entry can't do for itself: the
# first-run venv BOOTSTRAP, which must happen BEFORE the venv (and thus tsx's own
# node) — no, tsx runs on the repo's node, not the vLLM venv, so the bootstrap is
# purely about the vLLM python venv the engines exec. We bootstrap it here, then
# hand off to the tsx owner which resolves flags (AppSettings ⊕ env floor),
# spawns the engines OUTSIDE the tsx-watch loop, and holds them for adoption.
#
# VLLM_DISABLED / GPU-less no-ops are ALSO handled in engines.ts; this shim only
# adds the venv bootstrap that must precede it.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
# Model/venv stores are SHARED across git worktrees (git-common-dir parent); an explicit override wins.
STORE_ROOT="${VLLM_STORE_ROOT:-$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "$REPO/.git")")}"
VLLM_VENV="$STORE_ROOT/.cache/vllm/venv"

# VLLM_DISABLED / no-GPU: skip the bootstrap AND the engines (engines.ts prints the same skip note).
case "${VLLM_DISABLED:-}" in
  1 | on | yes | true)
    echo "engines: VLLM_DISABLED — skipping the local model engines (light boot)."
    exit 0
    ;;
esac
if ! { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; }; then
  echo "engines: no NVIDIA GPU on this host — nothing to run."
  exit 0
fi

# First-run venv bootstrap (no-op when current). Must precede the tsx owner (the engines exec this venv).
if [ ! -x "$VLLM_VENV/bin/vllm" ]; then
  echo "engines: vLLM venv missing — bootstrapping (first run only, several GB)…"
  bash "$REPO/scripts/dev/vllm-setup.sh" || { echo "engines: bootstrap failed — see output above."; exit 1; }
fi

# Hand off to the TS owner (the launch spec + sequential boot + foreground ownership live there).
exec "$REPO/node_modules/.bin/tsx" "$REPO/scripts/dev/engines.ts"

#!/usr/bin/env bash
# ── vLLM venv bootstrap (uv) ─────────────────────────────────────────────────
#
# Creates .cache/vllm/venv and installs a pinned vLLM with the official
# friction-free path: uv's `--torch-backend=auto` inspects the installed
# NVIDIA driver and selects matching CUDA wheels — no system CUDA toolkit,
# no index-URL archaeology, nothing outside this repo (cache pinned below).
#
# Called automatically by `pnpm engines` (scripts/dev/engines.sh) when the venv
# is missing; safe to run by hand (`bash scripts/dev/vllm-setup.sh`). Re-runs
# are no-ops unless the pin changes.
#
# TORCH BACKEND NOTE: `auto` is only safe when vLLM's own compiled kernels
# were built against the same CUDA major the driver reports. vLLM 0.22 builds
# against torch 2.11 (cu13x) which matches CUDA-13 drivers, so auto works.
# If a future bump dies at boot with `ImportError: libcudart.so.NN`, the wheel
# was built against a different CUDA than auto picked — pin TORCH_BACKEND to
# vLLM's build target (e.g. "cu129") instead. (Measured 2026-06-11 on 0.17:
# auto→cu130 vs cu12 kernels killed every engine.)
#
# SELF-CONTAINMENT: every cache this touches stays inside the repo —
#   uv wheels  → .cache/uv          models → .models/hf (set at SERVE time)
#   venv       → .cache/vllm/venv   vllm compile caches → .cache/vllm (serve time)
#
# Output contract (probe convention): last line is `RESULT vllm-setup …`.

set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
# Model/venv stores are SHARED across git worktrees: root them at the MAIN checkout (the git common
# dir's parent) so a linked worktree reuses the multi-GB caches instead of re-downloading. Falls back
# to this checkout outside a linked worktree; an explicit env override still wins.
STORE_ROOT="$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "$REPO/.git")")"
VENV="$STORE_ROOT/.cache/vllm/venv"

# Pinned vLLM line. Bump deliberately; the venv rebuilds when the marker
# below doesn't match.
VLLM_PIN="vllm>=0.22,<0.23"
TORCH_BACKEND="auto"
PIN_MARKER="$VENV/.orb-pin"

export UV_CACHE_DIR="$STORE_ROOT/.cache/uv"

if ! command -v uv >/dev/null 2>&1; then
  echo "vllm-setup: uv not found. Install it (single static binary):"
  echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
  echo ""
  echo "RESULT vllm-setup status=missing-uv"
  exit 1
fi

if [ -f "$PIN_MARKER" ] && [ "$(cat "$PIN_MARKER")" = "$VLLM_PIN @ $TORCH_BACKEND" ] && [ -x "$VENV/bin/vllm" ]; then
  echo "vllm-setup: venv current ($VLLM_PIN)"
  echo ""
  echo "RESULT vllm-setup status=current venv=$VENV"
  exit 0
fi

# Pin changed (or first run): rebuild the venv FROM SCRATCH. An in-place
# `uv pip install` is a no-op when the spec is already satisfied — a torch
# backend change would update the marker while leaving the wrong torch in
# place (measured: the cu130→cu129 fix did exactly that on first attempt).
echo "vllm-setup: (re)building venv + installing $VLLM_PIN (torch backend $TORCH_BACKEND; downloads several GB)…"
rm -rf "$VENV"
uv venv --quiet "$VENV"
uv pip install --python "$VENV/bin/python" --torch-backend="$TORCH_BACKEND" "$VLLM_PIN"
echo "$VLLM_PIN @ $TORCH_BACKEND" > "$PIN_MARKER"

"$VENV/bin/vllm" --version || true
echo ""
echo "RESULT vllm-setup status=installed venv=$VENV pin=$VLLM_PIN backend=$TORCH_BACKEND"

#!/usr/bin/env bash
# ── long-lived vLLM engine owner (the dev adoption seam) ─────────────────────
#
#   pnpm engines
#
# Boots the three loopback engines SEQUENTIALLY and stays in the foreground
# OWNING them. WHY: `pnpm dev` runs the server under `tsx watch`, which kills +
# respawns it on every file save. If the watched server owned the engines, each
# save would tear down + cold-respawn all three (~1-2 min). Instead, run THIS
# once in its own terminal — the engines outlive the watched server, and the
# in-server supervisor ADOPTS the already-healthy ports (and leaves adopted
# engines untouched on drain). Edit-save-reload stays instant; the engines stay warm.
#
# This is the ONLY thing neo's stack-leader did that the in-server adoptive
# supervisor (packages/server/src/infra/providers/vllm/engine/supervisor.ts)
# can't do for itself: own the engines OUTSIDE the watched process. There is no
# pgid stack-manager here — the supervisor already does spawn/adopt/death-couple;
# this just gives it something to adopt in dev. (Prod runs `pnpm start` with no
# file-watching, so the server owns the engines itself — `pnpm engines` is dev-only.)
#
# Engines spawn via scripts/dev/vllm-engine.sh — THE serve incantations, shared
# with the supervisor so the two owners can never drift. First run bootstraps
# the uv venv (scripts/dev/vllm-setup.sh; several GB).
#
# SEQUENTIAL BOOT: vLLM's memory profiler reads device-wide free-memory deltas,
# so two engines must never profile at once (neo MEASURED: concurrent boots gave
# embed a NEGATIVE KV budget and it died). Each must finish before the next; we
# gate on /health with a generous cap (first boot compiles graphs). A timeout is
# non-fatal — later engines still get their turn.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="$REPO/.cache/stack"
VLLM_VENV="$REPO/.cache/vllm/venv"
mkdir -p "$RUN_DIR"

# Mirror foundation/env defaults (env vars override both — one .env line moves the script + the server).
VLLM_EMBED_PORT="${VLLM_EMBED_PORT:-8701}"
VLLM_RERANK_PORT="${VLLM_RERANK_PORT:-8702}"
VLLM_GEN_PORT="${VLLM_GEN_PORT:-8703}"

# VLLM_DISABLED=true is the explicit "light boot" opt-out — skip the local model engines, same as a
# GPU-less host (derive roles fall back to jina local-light, which is lazy-loaded on first use). Honored
# HERE, not just in the server: stack.sh sets the SERVER flag, but dev.sh owns the engines OUTSIDE the
# watch loop, so without this guard `VLLM_DISABLED=true pnpm stack start` on a GPU box still spun the
# three engines (~30GB VRAM + power) for nothing. Accepts the same truthy spellings stack.sh normalizes
# (a standalone `pnpm engines` may see a raw ambient value).
case "${VLLM_DISABLED:-}" in
  1 | on | yes | true)
    echo "engines: VLLM_DISABLED — skipping the local model engines (light boot)."
    echo "engines: derive roles (embed/rerank/imageEmbed) use jina (local-light); summarize uses your hosted option."
    exit 0
    ;;
esac

gpu_present() { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; }
if ! gpu_present; then
  echo "engines: no NVIDIA GPU on this host — nothing to run."
  echo "engines: derive roles (embed/rerank/imageEmbed) use jina (local-light); summarize uses your hosted option."
  exit 0
fi

# First-run venv bootstrap (no-op when current).
if [ ! -x "$VLLM_VENV/bin/vllm" ]; then
  echo "engines: vLLM venv missing — bootstrapping (first run only, several GB)…"
  bash "$REPO/scripts/dev/vllm-setup.sh" || { echo "engines: bootstrap failed — see output above."; exit 1; }
fi

PIDS=()
cleanup() {
  echo ""
  echo "engines: stopping…"
  # Each engine was started under setsid (its own process group; pgid == the recorded pid), so one
  # group signal takes the APIServer AND its EngineCore children — no orphaned GPU residents.
  for p in "${PIDS[@]}"; do kill -TERM -- "-$p" 2>/dev/null; done
  wait 2>/dev/null
  echo "engines: stopped."
}
trap cleanup INT TERM HUP

wait_health() { # name port
  for _ in $(seq 1 180); do
    curl -sf -m 2 "http://127.0.0.1:$2/health" >/dev/null 2>&1 && { echo "engines: $1 up (:$2)"; return 0; }
    sleep 2
  done
  echo "engines: WARNING — $1 not healthy after 360s; continuing (see $RUN_DIR/vllm-$1.log)"
}

start_engine() { # name port
  echo "engines: starting $1 :$2"
  setsid bash "$REPO/scripts/dev/vllm-engine.sh" "$1" >"$RUN_DIR/vllm-$1.log" 2>&1 &
  PIDS+=("$!")
  wait_health "$1" "$2"
}

start_engine embed  "$VLLM_EMBED_PORT"
start_engine rerank "$VLLM_RERANK_PORT"
start_engine gen    "$VLLM_GEN_PORT"

echo ""
echo "engines: all booted — embed:$VLLM_EMBED_PORT rerank:$VLLM_RERANK_PORT gen:$VLLM_GEN_PORT"
echo "engines: owning them in the foreground; \`pnpm dev\` will ADOPT. Ctrl-C to stop. Logs: $RUN_DIR/vllm-*.log"
wait

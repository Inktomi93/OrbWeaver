#!/usr/bin/env bash
# ── single vLLM engine launcher — THE serve incantations ────────────────────
#
#   bash scripts/dev/vllm-engine.sh <embed|rerank|gen>
#
# The ONE place the per-engine serve flags live. Two consumers:
#   • scripts/dev/engines.sh — the dev engine owner (`pnpm engines`): owns the
#     engines OUTSIDE the tsx-watch server so a `pnpm dev` restart ADOPTS them
#     instead of rebooting them.
#   • packages/server/src/infra/providers/vllm/engine/supervisor.ts — the
#     in-server adoptive supervisor (spawns this when the server runs standalone
#     and owns the lifecycle, e.g. prod).
# Keep flags HERE so the two owners can never drift.
#
# exec's vllm serve in the foreground — the caller owns backgrounding, logging,
# and kill semantics. Env overrides mirror packages/server/src/foundation/env.
#
# Flag provenance (all grounded 2026-06-11, see the runners' headers):
#   embed : EOS serve template (cookbook-space pooling for the messages path),
#           is_matryoshka (MRL dimensions param), 1.84M px vision cap (the
#           reference wrapper's MAX_PIXELS=1800*32*32 — the model's trained regime).
#   rerank: local-snapshot serving (transformers 5.x hub-cache crash),
#           yes/no classifier overrides, vLLM-shipped score template,
#           1.84M px cap (reference default). Context 8192 (embed parity; the model itself is 32K-
#           documented / 262K-positional, so this is a serve choice, not a model
#           limit). The rerank runner truncates query+doc to fit, so a long doc
#           can never exceed it (was 4096 + no truncation → HTTP 400 on long docs).
#   gen   : TP=2 on 2-GPU boxes (NVLink, measured ~1.8×), 4.2M px cap.
# GPU budget on 2-card boxes: GPU0 = embed 0.22 + gen-half 0.35 (≈0.57); GPU1 = gen-half 0.35 +
# rerank 0.40 (≈0.75). Rerank rides GPU1 so it never contends with embed on GPU0 — a search embeds
# the query then reranks back-to-back, and co-locating them serialized the two on one card — and it
# gets a roomier KV (0.40 vs the old shared 0.22) so it can rerank full-length docs. Single-GPU:
# everything on GPU0 (embed 0.22 + rerank 0.22 + gen TP=1 0.50).

set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE="${1:?usage: vllm-engine.sh <embed|rerank|gen>}"
# Binary seam: bare-metal dev uses the repo venv (scripts/dev/vllm-setup.sh);
# the Docker image sets VLLM_BIN=/usr/local/bin/vllm (preinstalled in the
# official vllm/vllm-openai base). The python interpreter rides next to it.
VLLM="${VLLM_BIN:-$REPO/.cache/vllm/venv/bin/vllm}"
# Interpreter for huggingface_hub calls: explicit VLLM_PY wins (the Docker image
# pins /usr/bin/python3 — vllm's shebang target); else the venv python next to
# the binary; else whatever python3 is on PATH.
PY="${VLLM_PY:-$(dirname "$VLLM")/python3}"
[ -x "$PY" ] || PY="$(command -v python3)"

VLLM_EMBED_PORT="${VLLM_EMBED_PORT:-8701}"
VLLM_RERANK_PORT="${VLLM_RERANK_PORT:-8702}"
VLLM_GEN_PORT="${VLLM_GEN_PORT:-8703}"
VLLM_EMBED_MODEL="${VLLM_EMBED_MODEL:-Qwen/Qwen3-VL-Embedding-2B}"
VLLM_RERANK_MODEL="${VLLM_RERANK_MODEL:-Qwen/Qwen3-VL-Reranker-2B}"
VLLM_GEN_MODEL="${VLLM_GEN_MODEL:-Qwen/Qwen3-VL-8B-Instruct}"

# Caches pinned in-repo — the self-containment doctrine.
export HF_HOME="$REPO/.models/hf"
export VLLM_CACHE_ROOT="$REPO/.cache/vllm"
export XDG_CACHE_HOME="$REPO/.cache/xdg"

GPU_COUNT="$(nvidia-smi -L 2>/dev/null | wc -l)"

case "$ENGINE" in
  embed)
    export CUDA_VISIBLE_DEVICES=0
    exec "$VLLM" serve "$VLLM_EMBED_MODEL" --runner pooling \
      --hf_overrides '{"is_matryoshka": true}' \
      --chat-template "$REPO/scripts/dev/qwen3_vl_embedding_serve.jinja" \
      --mm-processor-kwargs '{"max_pixels": 1843200}' \
      --host 127.0.0.1 --port "$VLLM_EMBED_PORT" \
      --gpu-memory-utilization 0.22 --max-model-len 8192 --trust-remote-code
    ;;
  rerank)
    # Resolve via the huggingface_hub Python API — the `hf` CLI's stdout format
    # changes between versions (bare path → `path=…` → `  path: …`, all observed)
    # and parsing it broke twice. snapshot_download() is a no-op when cached and
    # returns exactly the snapshot path.
    RERANK_PATH="$("$PY" -c "from huggingface_hub import snapshot_download; print(snapshot_download('$VLLM_RERANK_MODEL'))" 2>/dev/null | tail -1)"
    [ -n "$RERANK_PATH" ] || { echo "vllm-engine: could not resolve rerank model path for '$VLLM_RERANK_MODEL'" >&2; exit 1; }
    # GPU1 on multi-GPU boxes — keeps rerank OFF GPU0 (embed + gen-half live there), so a search that
    # embeds-then-reranks doesn't serialize on one card, and rerank claims a roomier KV (0.40 vs the
    # old shared 0.22) so it can rerank full-length docs. Single-GPU falls back to GPU0 at 0.22.
    if [ "$GPU_COUNT" -ge 2 ]; then
      export CUDA_VISIBLE_DEVICES=1
      RERANK_UTIL=0.40
    else
      export CUDA_VISIBLE_DEVICES=0
      RERANK_UTIL=0.22
    fi
    exec "$VLLM" serve "$RERANK_PATH" --served-model-name "$VLLM_RERANK_MODEL" --runner pooling \
      --host 127.0.0.1 --port "$VLLM_RERANK_PORT" \
      --gpu-memory-utilization "$RERANK_UTIL" --max-model-len 8192 --trust-remote-code \
      --hf_overrides '{"architectures": ["Qwen3VLForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}' \
      --chat-template "$REPO/scripts/dev/qwen3_vl_reranker_serve.jinja" \
      --mm-processor-kwargs '{"max_pixels": 1843200}'
    ;;
  gen)
    GEN_TP=1; GEN_UTIL=0.50
    if [ "$GPU_COUNT" -ge 2 ]; then GEN_TP=2; GEN_UTIL=0.35; fi
    # 32k context: the model card recommends UP TO 16k output (VL) / 32k (text) per
    # request, which a 16k total context could never honor. Native window is 256K;
    # 32k fits the measured KV pool (93k tokens at TP=2 → ~2.9 full-length seqs).
    # --enable-auto-tool-choice + --tool-call-parser: turn on tool/function calling so the buddy
    # agent (non-owner path) can run its in-process MCP tool loop against the engine's Anthropic
    # /v1/messages endpoint. `hermes` is vLLM's parser for Qwen3 instruct tool-call output. Without
    # these, /v1/messages with tools 400s ("auto tool choice requires --enable-auto-tool-choice").
    # --served-model-name: register BOTH the full HF id (the OpenAI summarize/embed callers use it)
    # AND a slash-free leaf alias ("Qwen3-VL-8B-Instruct"). Claude Code / the agent-sdk CANNOT use
    # model ids containing "/" (documented vLLM×Claude-Code limitation → "Model not found"), so the
    # buddy's Anthropic /v1/messages path targets the slash-free alias.
    exec "$VLLM" serve "$VLLM_GEN_MODEL" \
      --served-model-name "$VLLM_GEN_MODEL" "${VLLM_GEN_MODEL##*/}" \
      --tensor-parallel-size "$GEN_TP" \
      --host 127.0.0.1 --port "$VLLM_GEN_PORT" \
      --gpu-memory-utilization "$GEN_UTIL" --max-model-len 32768 \
      --enable-auto-tool-choice --tool-call-parser hermes \
      --mm-processor-kwargs '{"max_pixels": 4194304}'
    ;;
  *)
    echo "vllm-engine: unknown engine '$ENGINE' (embed|rerank|gen)" >&2
    exit 2
    ;;
esac

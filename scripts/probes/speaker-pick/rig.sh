#!/usr/bin/env bash
# One CPU-capped llama.cpp server for the small-model arbiter arm, on loopback, models under .cache/speaker-pick.
#
#   scripts/probes/speaker-pick/rig.sh models        download the GGUFs (idempotent, about 1.6 GB)
#   scripts/probes/speaker-pick/rig.sh up <model>    start the server for qwen2.5-0.5b | qwen2.5-1.5b on 127.0.0.1:28121
#   scripts/probes/speaker-pick/rig.sh mem           print the container's memory use
#   scripts/probes/speaker-pick/rig.sh down          remove the container
#
# SPEAKER_PICK_CPUS (default 4) and SPEAKER_PICK_MEMORY (default 4g) set the caps.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MODELS="${SPEAKER_PICK_MODELS:-$REPO/.cache/speaker-pick/models}"
CPUS="${SPEAKER_PICK_CPUS:-4}"
MEMORY="${SPEAKER_PICK_MEMORY:-4g}"
NAME="orb-speaker-pick"
PORT=28121
IMAGE="ghcr.io/ggml-org/llama.cpp:server"
HF="https://huggingface.co"

gguf_of() {
  case "$1" in
    qwen2.5-0.5b) echo "qwen2.5-0.5b-instruct-q4_k_m.gguf" ;;
    qwen2.5-1.5b) echo "qwen2.5-1.5b-instruct-q4_k_m.gguf" ;;
    *) echo "unknown model: $1" >&2; exit 3 ;;
  esac
}

repo_of() {
  case "$1" in
    qwen2.5-0.5b) echo "Qwen/Qwen2.5-0.5B-Instruct-GGUF" ;;
    qwen2.5-1.5b) echo "Qwen/Qwen2.5-1.5B-Instruct-GGUF" ;;
  esac
}

models() {
  mkdir -p "$MODELS"
  for model in qwen2.5-0.5b qwen2.5-1.5b; do
    local file
    file="$(gguf_of "$model")"
    if [ -s "$MODELS/$file" ]; then
      echo "have $file"
    else
      echo "fetch $file"
      curl -sSL -o "$MODELS/$file.part" "$HF/$(repo_of "$model")/resolve/main/$file"
      mv "$MODELS/$file.part" "$MODELS/$file"
    fi
  done
}

up() {
  local file
  file="$(gguf_of "$1")"
  # A bound port is someone else's server; refuse rather than collide.
  if ss -ltn "sport = :$PORT" | tail -n +2 | grep -q .; then
    echo "port $PORT is already bound on this host; refusing to start" >&2
    exit 2
  fi
  docker run -d --name "$NAME" --cpus "$CPUS" --memory "$MEMORY" \
    -p "127.0.0.1:$PORT:8080" -v "$MODELS:/models:ro" \
    "$IMAGE" -m "/models/$file" --host 0.0.0.0 --port 8080 -c 4096 -t "$CPUS" --no-webui >/dev/null
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://127.0.0.1:$PORT/health"; then
      echo "$NAME ($1) on 127.0.0.1:$PORT"
      return 0
    fi
    sleep 2
  done
  echo "timed out waiting for $NAME" >&2
  exit 1
}

case "${1:-}" in
  models) models ;;
  up) up "${2:?model}" ;;
  mem) docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' "$NAME" ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 && echo "removed $NAME" || true ;;
  *) sed -n 2,9p "${BASH_SOURCE[0]}"; exit 3 ;;
esac

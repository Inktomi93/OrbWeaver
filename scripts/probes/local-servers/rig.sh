#!/usr/bin/env bash
# The local-server rig: Ollama, llama.cpp server and KoboldCpp in CPU-only containers, each capped, each on a
# loopback port of its own. Models live under the rig dir (`.cache/local-rig` by default), never in a user's
# model directory. `down` removes every container and the Ollama volume.
#
#   scripts/probes/local-servers/rig.sh models          download the GGUFs (idempotent)
#   scripts/probes/local-servers/rig.sh up <arm>        start one arm (see ARMS below)
#   scripts/probes/local-servers/rig.sh stop <arm>      remove one arm's container, keep its volume
#   scripts/probes/local-servers/rig.sh down [<arm>]    remove one arm, or everything, volumes included
#   scripts/probes/local-servers/rig.sh ps              list rig containers
#
# Arms and ports (all 127.0.0.1):
#   ollama           28111  ollama/ollama, pulls qwen2.5:0.5b, moondream, nomic-embed-text
#   llamacpp-chat    28112  llama.cpp server, Qwen2.5-0.5B-Instruct Q4_K_M, --jinja
#   llamacpp-vision  28113  llama.cpp server, SmolVLM-256M-Instruct Q8_0 + mmproj
#   llamacpp-embed   28114  llama.cpp server, nomic-embed-text-v1.5 Q8_0, --embedding
#   llamacpp-router  28115  llama.cpp server router mode over the models dir
#   kobold-chat      28116  KoboldCpp, Qwen2.5-0.5B-Instruct + nomic embedder, --jinja --jinjatools
#   kobold-vision    28117  KoboldCpp, SmolVLM-256M-Instruct + mmproj
#   kobold-universal 28118  KoboldCpp, Qwen2.5-0.5B-Instruct, its own tool injection (no --jinjatools)
#
# `LOCAL_RIG_OLLAMA_CTX=<n>` starts the Ollama arm with `OLLAMA_CONTEXT_LENGTH` set. `stop <arm>` removes the
# container and keeps the Ollama volume, so a restart does not pull again.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
RIG_DIR="${LOCAL_RIG_DIR:-$REPO/.cache/local-rig}"
MODELS="$RIG_DIR/models"
CPUS="${LOCAL_RIG_CPUS:-4}"
MEMORY="${LOCAL_RIG_MEMORY:-6g}"
PREFIX="orb-rig"

OLLAMA_IMAGE="ollama/ollama:latest"
LLAMACPP_IMAGE="ghcr.io/ggml-org/llama.cpp:server"
KOBOLD_IMAGE="koboldai/koboldcpp:latest"

QWEN="qwen2.5-0.5b-instruct-q4_k_m.gguf"
SMOLVLM="SmolVLM-256M-Instruct-Q8_0.gguf"
SMOLVLM_MMPROJ="mmproj-SmolVLM-256M-Instruct-Q8_0.gguf"
NOMIC="nomic-embed-text-v1.5.Q8_0.gguf"

HF="https://huggingface.co"
declare -A MODEL_URLS=(
  ["$QWEN"]="$HF/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/$QWEN"
  ["$SMOLVLM"]="$HF/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/$SMOLVLM"
  ["$SMOLVLM_MMPROJ"]="$HF/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/$SMOLVLM_MMPROJ"
  ["$NOMIC"]="$HF/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/$NOMIC"
)

ARMS=(ollama llamacpp-chat llamacpp-vision llamacpp-embed llamacpp-router kobold-chat kobold-vision kobold-universal)

port_of() {
  case "$1" in
    ollama) echo 28111 ;;
    llamacpp-chat) echo 28112 ;;
    llamacpp-vision) echo 28113 ;;
    llamacpp-embed) echo 28114 ;;
    llamacpp-router) echo 28115 ;;
    kobold-chat) echo 28116 ;;
    kobold-vision) echo 28117 ;;
    kobold-universal) echo 28118 ;;
    *) echo "unknown arm: $1" >&2; exit 3 ;;
  esac
}

models() {
  mkdir -p "$MODELS"
  for name in "${!MODEL_URLS[@]}"; do
    if [ -s "$MODELS/$name" ]; then
      echo "have $name"
    else
      echo "fetch $name"
      curl -sSL -o "$MODELS/$name.part" "${MODEL_URLS[$name]}"
      mv "$MODELS/$name.part" "$MODELS/$name"
    fi
  done
  # llama.cpp router mode reads a directory: single files at the top, a multimodal pair in a subdirectory
  # whose projector file name starts with `mmproj`.
  mkdir -p "$MODELS/router/smolvlm-256m"
  ln -sf "../../$SMOLVLM" "$MODELS/router/smolvlm-256m/$SMOLVLM"
  ln -sf "../../$SMOLVLM_MMPROJ" "$MODELS/router/smolvlm-256m/$SMOLVLM_MMPROJ"
  ln -sf "../$QWEN" "$MODELS/router/$QWEN"
}

# A port already bound on the host is someone else's server; refuse rather than collide.
require_free_port() {
  if ss -ltn "sport = :$1" | tail -n +2 | grep -q .; then
    echo "port $1 is already bound on this host; refusing to start" >&2
    exit 2
  fi
}

run_common() {
  # $1 name, $2 port, $3 container port, the rest: image + args
  local name="$1" port="$2" cport="$3"
  shift 3
  require_free_port "$port"
  docker run -d --name "$PREFIX-$name" --cpus "$CPUS" --memory "$MEMORY" \
    -p "127.0.0.1:$port:$cport" \
    -v "$MODELS:/models:ro" \
    "$@" >/dev/null
  echo "$PREFIX-$name on 127.0.0.1:$port"
}

up() {
  local arm="$1"
  local port
  port="$(port_of "$arm")"
  case "$arm" in
    ollama)
      require_free_port "$port"
      docker volume create "$PREFIX-ollama-data" >/dev/null
      docker run -d --name "$PREFIX-ollama" --cpus "$CPUS" --memory "$MEMORY" \
        -p "127.0.0.1:$port:11434" -v "$PREFIX-ollama-data:/root/.ollama" \
        -e OLLAMA_HOST=0.0.0.0 ${LOCAL_RIG_OLLAMA_CTX:+-e OLLAMA_CONTEXT_LENGTH=$LOCAL_RIG_OLLAMA_CTX} "$OLLAMA_IMAGE" >/dev/null
      echo "$PREFIX-ollama on 127.0.0.1:$port"
      wait_http "http://127.0.0.1:$port/api/version"
      for model in qwen2.5:0.5b moondream nomic-embed-text; do
        docker exec "$PREFIX-ollama" ollama pull "$model"
      done
      ;;
    llamacpp-chat)
      run_common "$arm" "$port" 8080 "$LLAMACPP_IMAGE" -m "/models/$QWEN" --host 0.0.0.0 --port 8080 --jinja -c 4096 -t "$CPUS" --no-webui
      ;;
    llamacpp-vision)
      run_common "$arm" "$port" 8080 "$LLAMACPP_IMAGE" -m "/models/$SMOLVLM" --mmproj "/models/$SMOLVLM_MMPROJ" --host 0.0.0.0 --port 8080 --jinja -c 4096 -t "$CPUS" --no-webui
      ;;
    llamacpp-embed)
      run_common "$arm" "$port" 8080 "$LLAMACPP_IMAGE" -m "/models/$NOMIC" --embedding --host 0.0.0.0 --port 8080 -c 2048 -t "$CPUS" --no-webui
      ;;
    llamacpp-router)
      run_common "$arm" "$port" 8080 "$LLAMACPP_IMAGE" --models-dir /models/router --host 0.0.0.0 --port 8080 --jinja -c 2048 -t "$CPUS" --no-webui
      ;;
    kobold-chat)
      run_common "$arm" "$port" 5001 -e KCPP_DONT_TUNNEL=true \
        -e KCPP_ARGS="--model /models/$QWEN --embeddingsmodel /models/$NOMIC --host 0.0.0.0 --port 5001 --contextsize 4096 --threads $CPUS --jinja --jinjatools --quiet" \
        "$KOBOLD_IMAGE"
      ;;
    kobold-vision)
      run_common "$arm" "$port" 5001 -e KCPP_DONT_TUNNEL=true \
        -e KCPP_ARGS="--model /models/$SMOLVLM --mmproj /models/$SMOLVLM_MMPROJ --host 0.0.0.0 --port 5001 --contextsize 4096 --threads $CPUS --jinja --quiet" \
        "$KOBOLD_IMAGE"
      ;;
    kobold-universal)
      run_common "$arm" "$port" 5001 -e KCPP_DONT_TUNNEL=true \
        -e KCPP_ARGS="--model /models/$QWEN --host 0.0.0.0 --port 5001 --contextsize 4096 --threads $CPUS --quiet" \
        "$KOBOLD_IMAGE"
      ;;
  esac
}

wait_http() {
  local url="$1" tries="${2:-120}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi
    sleep 2
  done
  echo "timed out waiting for $url" >&2
  return 1
}

stop() {
  docker rm -f "$PREFIX-$1" >/dev/null 2>&1 && echo "removed $PREFIX-$1" || true
}

down() {
  local names
  if [ $# -gt 0 ]; then
    names=("$PREFIX-$1")
  else
    mapfile -t names < <(docker ps -a --filter "name=^$PREFIX-" --format '{{.Names}}')
  fi
  for name in "${names[@]}"; do
    docker rm -f "$name" >/dev/null 2>&1 && echo "removed $name" || true
  done
  if [ $# -eq 0 ] || [ "$1" = "ollama" ]; then
    docker volume rm "$PREFIX-ollama-data" >/dev/null 2>&1 && echo "removed volume $PREFIX-ollama-data" || true
  fi
}

ps_rig() {
  docker ps -a --filter "name=^$PREFIX-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  docker volume ls --filter "name=^$PREFIX-" --format 'volume {{.Name}}'
}

case "${1:-}" in
  models) models ;;
  up) up "${2:?arm}" ;;
  stop) stop "${2:?arm}" ;;
  down) shift; down "$@" ;;
  ps) ps_rig ;;
  *) sed -n 2,20p "${BASH_SOURCE[0]}"; exit 3 ;;
esac

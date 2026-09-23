#!/bin/bash
set -e

RIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The DATA root may live in another checkout (see rig-paths.ts); the scripts and the corpus separate.
DATA_ROOT="${ST_GOLDENS_DATA_ROOT:-$RIG_DIR}"
FIXTURES_DIR="$DATA_ROOT/fixtures"
# NEVER wipe the capture dirs — see the note in run-demo-goldens.sh. A wipe here destroys the other
# sweep's arm, which is exactly how this corpus lost its 16-combo ST captures.
mkdir -p "$FIXTURES_DIR" "$DATA_ROOT/output" "$DATA_ROOT/orbweaver-output"

# Fail-closed guard: a swallowed capture failure used to let compare-runner.ts read STALE output from a
# prior run as if it were fresh evidence. RUN_STAMP marks "now"; every capture below must produce (or
# re-touch) its output file NEWER than this stamp, or the run aborts.
RUN_STAMP="$(mktemp)"
FAILURES=0
check_capture() {
  local id="$1"
  local out="$DATA_ROOT/output/${id}.json"
  if [ ! -f "$out" ] || [ ! "$out" -nt "$RUN_STAMP" ]; then
    echo "FATAL: capture for '${id}' is missing or stale (no fresh $out) — refusing to compare against stale evidence." >&2
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Resetting ST fixtures..."
node "$RIG_DIR/build-fixtures.ts"

id_depth="ashen_spire_claude_depth_injection"
cat << JSON > "$FIXTURES_DIR/${id_depth}.json"
{
  "id": "${id_depth}",
  "provider": "claude",
  "model": "claude-3-5-sonnet-20240620",
  "character": { "name": "Sabine Veyra" },
  "user": { "name": "Traveler" },
  "chatFile": "ashen-spire",
  "settings": {
    "custom_prompt_post_processing": "strict",
    "squash_system_messages": false,
    "assistant_prefill": ""
  },
  "commands": [
    "/world Eldoria",
    "/note This is a deeply injected author's note.",
    "/depth 4"
  ],
  "messages": [
    {
      "role": "user",
      "content": "Tell me about Eldoria and the shadowfang."
    }
  ]
}
JSON

# The depth-injection fixture was written but never captured — its ST arm has never existed.
echo "Running $id_depth..."
node "$RIG_DIR/build-fixtures.ts"
node "$RIG_DIR/generate-goldens.ts" "${id_depth}" || echo "WARNING: capture failed for ${id_depth} (continuing sweep; freshness gate below catches it)" >&2
check_capture "${id_depth}"

MODELS=("claude-instant-1.2" "claude-2.0" "claude-2.1" "claude-3-haiku-20240307" "claude-3-sonnet-20240229" "claude-3-opus-20240229" "claude-3-5-sonnet-20240620" "claude-3-5-sonnet-20241022" "claude-3-5-haiku-20241022")

for MODEL in "${MODELS[@]}"; do
  id_tools="ashen_spire_claude_${MODEL}_tools"
  cat << JSON > "$FIXTURES_DIR/${id_tools}.json"
{
  "id": "${id_tools}",
  "provider": "claude",
  "model": "${MODEL}",
  "character": { "name": "Sabine Veyra" },
  "user": { "name": "Traveler" },
  "chatFile": "ashen-spire",
  "settings": {
    "custom_prompt_post_processing": "strict_tools",
    "squash_system_messages": false,
    "assistant_prefill": "",
    "function_calling": true
  },
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the current weather for a specific location.",
      "parameters": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "The location to get the weather for."
          }
        },
        "required": ["location"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "What is the weather in Eldoria?"
    }
  ]
}
JSON

  echo "Resetting ST fixtures before test..."
  node "$RIG_DIR/build-fixtures.ts"

  echo "Running Tool Calling test for ${MODEL}..."
  node "$RIG_DIR/generate-goldens.ts" "${id_tools}" || echo "WARNING: capture failed for ${id_tools} (continuing sweep; freshness gate below catches it)" >&2
  check_capture "${id_tools}"
done

if [ "$FAILURES" -gt 0 ]; then
  rm -f "$RUN_STAMP"
  echo "FATAL: $FAILURES capture(s) missing or stale — aborting." >&2
  exit 1
fi
rm -f "$RUN_STAMP"

echo "ST arm done. There is no ORB-arm script; see README.md \"The ORB arm\"."

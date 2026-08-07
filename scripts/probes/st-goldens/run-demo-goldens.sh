#!/bin/bash
set -e

RIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$RIG_DIR/fixtures"
mkdir -p "$FIXTURES_DIR"
rm -rf "$RIG_DIR/output" "$RIG_DIR/orbweaver-output"
mkdir -p "$RIG_DIR/output" "$RIG_DIR/orbweaver-output"

# Base configuration
nb=0
force="false"

# 4 post_processing options, 2 squash options, 2 prefill options = 16 combos
for mode in "" "strict" "merge" "semi"; do
  for squash in "false" "true"; do
    for prefill in "" "This is a prefill response:"; do
      
      # Sanitize mode for ID
      if [ -z "$mode" ]; then
        mode_id="none"
      else
        mode_id="$mode"
      fi

      if [ -z "$prefill" ]; then
        prefill_id="noprefill"
      else
        prefill_id="withprefill"
      fi

      id="ashen_spire_claude_${mode_id}_squash${squash}_${prefill_id}"
      
      cat << JSON > "$FIXTURES_DIR/${id}.json"
{
  "id": "${id}",
  "provider": "claude",
  "model": "claude-3-5-sonnet-20240620",
  "character": { "name": "Sabine Veyra" },
  "user": { "name": "Traveler" },
  "chatFile": "ashen-spire",
  "settings": {
    "custom_prompt_post_processing": "${mode}",
    "squash_system_messages": ${squash},
    "assistant_prefill": "${prefill}",
    "names_behavior": ${nb},
    "always_force_name2": ${force}
  },
  "messages": []
}
JSON

      echo "Resetting ST fixtures before test..."
      node "$RIG_DIR/build-fixtures.ts"

      echo "Running $id..."
      node "$RIG_DIR/generate-goldens.ts" "${id}" || true
    done
  done
done

echo "Running capture-orbweaver.ts to generate Orbweaver golden payloads..."
node "$RIG_DIR/capture-orbweaver.ts"

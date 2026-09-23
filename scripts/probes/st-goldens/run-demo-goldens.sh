#!/bin/bash
set -e

RIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The DATA root may live in another checkout (see rig-paths.ts); the scripts and the corpus separate.
DATA_ROOT="${ST_GOLDENS_DATA_ROOT:-$RIG_DIR}"
FIXTURES_DIR="$DATA_ROOT/fixtures"
# NEVER wipe the capture dirs. The ST arm writes one file per fixture and the ORB arm sweeps every fixture
# on disk, so a wipe here destroys the OTHER sweep's arm entirely — it is how the 16-combo ST captures were
# lost while their file-count-equal ORB counterparts survived as 44 copies of one capture. Ids are the
# filenames, so a re-run overwrites exactly its own outputs and nothing else.
mkdir -p "$FIXTURES_DIR" "$DATA_ROOT/output" "$DATA_ROOT/orbweaver-output"

# Fail-closed guard: a swallowed capture failure must not leave STALE output from a prior sweep looking like
# fresh evidence. RUN_STAMP marks "now";
# every capture below must produce (or re-touch) its output file NEWER than this stamp, or the run aborts.
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
      node "$RIG_DIR/generate-goldens.ts" "${id}" || echo "WARNING: capture failed for ${id} (continuing sweep; freshness gate below catches it)" >&2
      check_capture "${id}"
    done
  done
done

if [ "$FAILURES" -gt 0 ]; then
  rm -f "$RUN_STAMP"
  echo "FATAL: $FAILURES capture(s) missing or stale — aborting." >&2
  exit 1
fi
rm -f "$RUN_STAMP"

echo "ST arm done. There is no ORB-arm script; see README.md \"The ORB arm\"."

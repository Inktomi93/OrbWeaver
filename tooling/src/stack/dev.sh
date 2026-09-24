#!/usr/bin/env bash
# ── the dev server boot: the watched server ──────────────────────────────────
#
# This is the SERVER half of the dev stack — `pnpm stack up` runs it (via `bash
# tooling/src/stack/stack.sh` → this file by path) and adds vite on top. There is no
# `pnpm dev` alias any more: `pnpm stack` is the ONE front door (a foreground,
# vite-less server run is `bash tooling/src/stack/dev.sh` by hand).
#
# Model engines are not this script's business: a vLLM box is a connection row the server dials, and
# whoever runs it does so outside this repo. Ctrl-C tears down THIS script + the watched server.

set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="$REPO/node_modules/.bin"

SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null
  wait 2>/dev/null
}
# A SIGNAL MUST END THIS SCRIPT, not merely run cleanup. bash defers a trap until the current FOREGROUND
# child returns, and a plain `trap cleanup TERM` does not exit — a leader's boot-timeout TERM would then
# be serviced late and the script would continue, leaving an orphan holding :8788. Signals get a handler
# that cleans up and EXITS; EXIT keeps the plain cleanup so a normal end still reaps the server.
on_signal() {
  cleanup
  exit 143 # 128 + SIGTERM, the shell's own convention for signal-terminated
}
trap on_signal INT TERM HUP
trap cleanup EXIT

# The watched server. Process-sub for the
# pretty pipe so SERVER_PID is NODE ITSELF (killable in cleanup), not pino-pretty;
# pino-pretty exits on its own when the pipe closes. Explicit bin paths so this
# works whether invoked via `pnpm stack` or by hand — `node` is the platform binary, so no $BIN
# prefix (and no loader). Explicit workspace watch roots keep Node out of imported `node_modules`: tooling
# legitimately touches installed package files, and recursive dependency watching was restarting the server
# mid-turn and erasing its in-memory wire/RPG flight recorders. `--watch-preserve-output` keeps the
# pino-pretty scrollback across a restart; `--watch-kill-signal` (default SIGTERM) is the escape if needed.
# We then wait on the server so
# its exit (or a signal) drives the trap.
#
# ONLY stdout (the pino JSON stream) is piped to pino-pretty — stderr (node's
# watch chatter, Node warnings, uncaught stack traces) stays RAW on the
# terminal instead of being blasted through the pretty parser as junk lines.
# pino-pretty opts make it usable, not a firehose: drop pid/hostname, local-time
# stamps, and --singleLine so each log (with its bound requestId/userId) is ONE
# scannable line instead of an exploded object. Prod (`pnpm stack start-fg prod`) stays raw JSON.
node --watch --watch-preserve-output \
  --watch-path="$REPO/packages/server/src" \
  --watch-path="$REPO/packages/contracts/src" \
  --watch-path="$REPO/packages/db/src" \
  --watch-path="$REPO/packages/kit/src" \
  "$REPO/packages/server/src/entry/index.ts" \
  > >("$BIN/pino-pretty" --config "$REPO/tooling/src/stack/ops/pino-pretty.json") &
SERVER_PID=$!
wait "$SERVER_PID"

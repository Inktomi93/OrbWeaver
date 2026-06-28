#!/usr/bin/env bash
# ── pnpm dev — ONE command: vLLM engines + the watched server ────────────────
#
# The reload-on-save problem: `tsx watch` kills + respawns the SERVER on every
# file save. If the server owned the vLLM engines, each save would cold-respawn
# the trio (~1-2 min). So this launcher owns the engines ITSELF — they are
# children of THIS script, not of the watched server — and the server merely
# ADOPTS the already-warm ports. A save restarts only the server; it re-adopts
# the same engines. No engine reload, and you run ONE command.
#
# This is neo's stack-leader collapsed into `pnpm dev`: there is no pgid
# stack-manager — the in-server adoptive supervisor does spawn/adopt/death-couple
# for itself. This script just (a) owns the engines outside the watch loop and
# (b) sets STACK_ENGINES=yes so the supervisor WAITS for these engines and adopts
# them instead of racing to spawn its own (which would re-own → reload-on-save).
#
# GPU-less box: engines.sh no-ops (derive roles → jina local-light, summarize →
# hosted), the supervisor stays disabled, and this is just `tsx watch` + pretty.
#
# Ctrl-C tears down the whole thing (the trap kills the engine owner, whose own
# trap group-kills the three engines).

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$REPO/node_modules/.bin"

ENGINES_PID=""
SERVER_PID=""
cleanup() {
  # Kill BOTH explicitly so teardown is bulletproof no matter how we're stopped
  # (Ctrl-C → group SIGINT, an IDE's TERM-to-the-launcher, a closed terminal's
  # HUP). engines.sh's own trap group-kills the three engines; tsx on TERM stops
  # the watched server it spawned.
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null
  [ -n "$ENGINES_PID" ] && kill -TERM "$ENGINES_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup INT TERM HUP EXIT

# Own the engines outside the watch loop (engines.sh boots them sequentially and
# holds them). STACK_ENGINES=yes tells the server to adopt, not spawn.
export STACK_ENGINES=yes
bash "$REPO/scripts/dev/engines.sh" &
ENGINES_PID=$!

# The watched server. tsx restarts re-adopt the warm engines. Process-sub for the
# pretty pipe so SERVER_PID is tsx ITSELF (killable in cleanup), not pino-pretty;
# pino-pretty exits on its own when the pipe closes. Explicit bin paths so this
# works whether invoked via `pnpm dev` or by hand. We then wait on the server so
# its exit (or a signal) drives the trap.
"$BIN/tsx" watch "$REPO/packages/server/src/entry/index.ts" > >("$BIN/pino-pretty") 2>&1 &
SERVER_PID=$!
wait "$SERVER_PID"

#!/usr/bin/env bash
# ── pnpm dev — ONE command: vLLM engines + the watched server ────────────────
#
# The reload-on-save problem: `tsx watch` kills + respawns the SERVER on every
# file save. If the server owned the vLLM engines, each save would cold-respawn
# the trio (~1-2 min). FLEET MODEL (A.4): the engines are a box-level SINGLETON
# spawned DETACHED (`engines:start` → setsid + pidfile), owned by NOBODY — so a
# `pnpm dev` restart (or a dev Ctrl-C) leaves the fleet warm for the next orb, and
# the in-server supervisor merely ADOPTS the running ports. A save restarts only
# the server; it re-adopts the same engines. No engine reload, one command.
#
# OWNERSHIP INVERSION: the engines are no longer children of this script (the old
# death-couple that took them down on session teardown — the bit-us-twice class).
# `engines:start` is idempotent (a healthy fleet is a no-op), so re-running dev
# collapses to one spawn. The supervisor's own spawn action also routes through
# the same detached verb.
#
# GPU-less box / ENGINES_POSTURE=off: engines.sh no-ops (derive roles → jina
# local-light, summarize → hosted) and this is just `tsx watch` + pretty.
#
# Ctrl-C tears down THIS script + the watched server — the detached fleet SURVIVES
# (warm for the next orb; `pnpm engines:stop` is the only kill).

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$REPO/node_modules/.bin"

SERVER_PID=""
cleanup() {
  # Kill only the watched SERVER — the detached fleet is nobody's child and SURVIVES
  # (warm for the next orb). No engine teardown here (the ownership-inversion fix for
  # the bit-us-twice class); `pnpm engines:stop` is the only kill.
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup INT TERM HUP EXIT

# Ensure the fleet is up, DETACHED (idempotent — a healthy fleet is a no-op). The
# engines are a box-level singleton owned by nobody; the in-server supervisor adopts
# them. Runs to completion (does NOT block — the fleet is detached), then the watched
# server boots and adopts. ENGINES_POSTURE defaults to adopt-or-start (the manager).
bash "$REPO/scripts/dev/engines.sh" start || echo "dev: engines:start reported a problem (continuing — server will fail-fast if a role needs vllm)"

# The watched server. tsx restarts re-adopt the warm engines. Process-sub for the
# pretty pipe so SERVER_PID is tsx ITSELF (killable in cleanup), not pino-pretty;
# pino-pretty exits on its own when the pipe closes. Explicit bin paths so this
# works whether invoked via `pnpm dev` or by hand. We then wait on the server so
# its exit (or a signal) drives the trap.
#
# ONLY stdout (the pino JSON stream) is piped to pino-pretty — stderr (tsx's
# watch/compile chatter, Node warnings, uncaught stack traces) stays RAW on the
# terminal instead of being blasted through the pretty parser as junk lines.
# pino-pretty opts make it usable, not a firehose: drop pid/hostname, local-time
# stamps, and --singleLine so each log (with its bound requestId/userId) is ONE
# scannable line instead of an exploded object. Prod (`pnpm start`) stays raw JSON.
"$BIN/tsx" watch "$REPO/packages/server/src/entry/index.ts" \
  > >("$BIN/pino-pretty" --config "$REPO/scripts/dev/pino-pretty.json") &
SERVER_PID=$!
wait "$SERVER_PID"

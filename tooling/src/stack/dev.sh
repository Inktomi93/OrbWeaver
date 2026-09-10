#!/usr/bin/env bash
# ── the dev server boot: vLLM engines + the watched server ───────────────────
#
# This is the SERVER half of the dev stack — `pnpm stack up` runs it (via `bash
# tooling/src/stack/stack.sh` → this file by path) and adds vite on top. There is no
# `pnpm dev` alias any more: `pnpm stack` is the ONE front door (a foreground,
# vite-less server run is `bash tooling/src/stack/dev.sh` by hand).
#
# The reload-on-save problem: `node --watch` kills + respawns the SERVER on every
# file save. If the server owned the vLLM engines, each save would cold-respawn
# the trio (~1-2 min). FLEET MODEL (A.4): the engines are a box-level SINGLETON
# spawned DETACHED (`engines start` → setsid + pidfile), owned by NOBODY — so a
# dev restart (or a dev Ctrl-C) leaves the fleet warm for the next orb, and
# the in-server supervisor merely ADOPTS the running ports. A save restarts only
# the server; it re-adopts the same engines. No engine reload, one command.
#
# OWNERSHIP INVERSION: the engines are no longer children of this script (the old
# death-couple that took them down on session teardown — the bit-us-twice class).
# `engines start` is idempotent (a healthy fleet is a no-op), so re-running dev
# collapses to one spawn. The supervisor's own spawn action also routes through
# the same detached verb.
#
# GPU-less box / ENGINES_POSTURE=off: engines.sh no-ops (derive roles → jina
# local-light, summarize → hosted) and this is just `node --watch` + pretty.
#
# Ctrl-C tears down THIS script + the watched server — the detached fleet SURVIVES
# (warm for the next orb; `pnpm engines stop` is the only kill).

set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
BIN="$REPO/node_modules/.bin"

SERVER_PID=""
ENGINES_PID=""
cleanup() {
  # Kill only the watched SERVER (and the engines WAITER below if we are still inside it) — the detached
  # fleet is nobody's child and SURVIVES (warm for the next orb). No engine teardown here (the
  # ownership-inversion fix for the bit-us-twice class); `pnpm engines stop` is the only kill.
  [ -n "$ENGINES_PID" ] && kill -TERM "$ENGINES_PID" 2>/dev/null
  [ -n "$SERVER_PID" ] && kill -TERM "$SERVER_PID" 2>/dev/null
  wait 2>/dev/null
}
# A SIGNAL MUST END THIS SCRIPT, not merely run cleanup (#1567). bash defers a trap until the current
# FOREGROUND child returns, and a plain `trap cleanup TERM` does not exit — so the leader's boot-timeout
# TERM (stack.sh run_leader) landed on a dev.sh that was blocked inside `engines.sh start`, was queued for
# the length of that wait, and then let the script CONTINUE into `node --watch`. Result, owner-witnessed
# 2026-09-04: a dead pidfile group with an orphan dev.sh (reparented to `systemd --user`) holding :8788 —
# the same shape as the earlier EADDRINUSE race. Signals get a handler that cleans up and EXITS; EXIT
# keeps the plain cleanup so a normal end still reaps the server.
on_signal() {
  cleanup
  exit 143 # 128 + SIGTERM, the shell's own convention for signal-terminated
}
trap on_signal INT TERM HUP
trap cleanup EXIT

# Ensure the fleet is up, DETACHED (idempotent — a healthy fleet is a no-op). The
# engines are a box-level singleton owned by nobody; the in-server supervisor adopts
# them. Runs to completion (does NOT block — the fleet is detached), then the watched
# server boots and adopts. ENGINES_POSTURE decides whether a spawn is even permitted
# (#1567 — engines.sh is the one home of that branch): `adopt-only` adopts a healthy
# fleet and otherwise refuses to spawn; unset defaults to adopt-or-start (the manager).
#
# BACKGROUNDED + `wait`, never a foreground call: `wait` is interruptible, so a TERM arriving during a
# cold boot reaches on_signal IMMEDIATELY instead of being queued behind engines.sh's own bounded wait
# (ENGINES_BOOT_TIMEOUT, default 900s — five times the leader's healthz gate).
bash "$REPO/tooling/src/stack/engines.sh" start &
ENGINES_PID=$!
wait "$ENGINES_PID" || echo "dev: engines start reported a problem (continuing — server will fail-fast if a role needs vllm)"
ENGINES_PID=""

# The watched server. Restarts re-adopt the warm engines. Process-sub for the
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

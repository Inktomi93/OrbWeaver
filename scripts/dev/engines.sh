#!/usr/bin/env bash
# ── vLLM engine FLEET front door (A.4) ───────────────────────────────────────
#
#   pnpm engines            adopt-or-start: ensure the fleet is up (detached),
#                           then tail its logs. Ctrl-C DETACHES (the fleet stays
#                           warm for the next orb) — engines:stop is the only kill.
#   pnpm engines:start      THE spawner: venv bootstrap → reconcile → VRAM
#                           pre-check → setsid-detached boot + pidfile. Idempotent
#                           (a healthy fleet is a no-op), so N adopters collapse to
#                           one spawn.
#   pnpm engines:stop       group-kill the family by pidfile (TERM → wait → KILL),
#                           verified against the known pids AND the ports.
#   pnpm engines:status     per-engine pid · /health · /is_sleeping · GPU tenants.
#   pnpm engines:sleep      POST /sleep?level=1 + write the hold marker.
#   pnpm engines:wake       clear hold → reconcile → VRAM gate → wake + wait.
#   pnpm engines:reconcile  orphan-family sweep (also runs pre-spawn).
#
# OWNERSHIP INVERSION: no stack owns the engines as process children anymore. The
# detached boot (engines.ts --detach) leaves each engine as its OWN setsid group
# leader and EXITS, so the fleet survives the launcher's death — the bit-us-twice
# class is unmakeable. The logic-heavy verbs (status/sleep/wake/reconcile) live in
# scripts/dev/engines-ctl.ts (importing the server module, so the wake-budget math
# is ONE-homed); this shim owns the pgid/pidfile choreography (bash's wheelhouse)
# + the first-run venv bootstrap (must precede tsx, which runs on the repo node).
#
# Output contract (probe convention): the LAST line is `RESULT engines …`.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_DIR="$REPO/.cache/stack"
PIDFILE="$RUN_DIR/engines.pgid"
LOG_DIR="$RUN_DIR"
TSX="$REPO/node_modules/.bin/tsx"
# tsx is a ROOT devDependency — absent from a prod-pruned install (the container image, which carries the
# `pnpm deploy --prod` node_modules). node 26 runs .ts source directly (the same mechanism as the server),
# so fall back to plain node there; dev boxes keep the tsx binary and are byte-identical.
[ -x "$TSX" ] || TSX="node"
CTL_TS="$REPO/scripts/dev/engines-ctl.ts"
# Model/venv stores are SHARED across git worktrees (git-common-dir parent); an explicit override wins.
STORE_ROOT="${VLLM_STORE_ROOT:-$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "$REPO/.git")")}"
VLLM_VENV="$STORE_ROOT/.cache/vllm/venv"
# The three loopback ports (env-overridable; defaults mirror foundation/env).
EMBED_PORT="${VLLM_EMBED_PORT:-8701}"
RERANK_PORT="${VLLM_RERANK_PORT:-8702}"
GEN_PORT="${VLLM_GEN_PORT:-8703}"
PORTS=("$EMBED_PORT" "$RERANK_PORT" "$GEN_PORT")
KILL_GRACE_TICKS=30 # 30 x 0.5s = 15s

mkdir -p "$RUN_DIR"

health_ok() { curl -sf -m 2 "http://127.0.0.1:$1/health" >/dev/null 2>&1; }
fleet_healthy() {
  local p
  for p in "${PORTS[@]}"; do health_ok "$p" || return 1; done
  return 0
}
fleet_down() {
  local p
  for p in "${PORTS[@]}"; do health_ok "$p" && return 1; done
  return 0
}
pid_alive() { kill -0 "$1" 2>/dev/null; }

# ── VLLM_DISABLED / no-GPU: nothing to run (the light-boot no-op) ─────────────
skip_if_disabled() {
  case "${VLLM_DISABLED:-}" in
    1 | on | yes | true)
      echo "engines: VLLM_DISABLED — skipping the local model engines (light boot)."
      echo ""
      echo "RESULT engines verb=$1 status=disabled"
      exit 0
      ;;
  esac
  if ! { command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; }; then
    echo "engines: no NVIDIA GPU on this host — nothing to run."
    echo ""
    echo "RESULT engines verb=$1 status=no-gpu"
    exit 0
  fi
}

bootstrap_venv() {
  if [ ! -x "$VLLM_VENV/bin/vllm" ]; then
    echo "engines: vLLM venv missing — bootstrapping (first run only, several GB)…"
    bash "$REPO/scripts/dev/vllm-setup.sh" || {
      echo "engines: bootstrap failed — see output above."
      exit 1
    }
  fi
}

# ── start: the detached spawner (idempotent) ─────────────────────────────────
do_start() {
  skip_if_disabled start
  if fleet_healthy; then
    echo "engines: fleet already healthy on ${PORTS[*]} — nothing to spawn (idempotent)."
    echo ""
    echo "RESULT engines verb=start status=already-up"
    return 0
  fi
  bootstrap_venv
  # Reconcile (orphan-family sweep) before the boot — the VRAM pre-check inside engines.ts then names a REAL
  # foreign tenant, never our own corpse.
  "$TSX" "$CTL_TS" reconcile >/dev/null 2>&1 || true
  # The detached boot: setsid so the LAUNCHER is its own session; engines.ts --detach boots each engine as
  # its own setsid group, writes the pidfile, and EXITS. The engines survive this shell's death (the
  # bit-us-twice fix). Run it backgrounded + wait (bounded) for the fleet to come healthy.
  echo "engines: spawning the fleet (detached) — logs in $LOG_DIR/vllm-*.log"
  setsid "$TSX" "$REPO/scripts/dev/engines.ts" --detach >>"$LOG_DIR/engines-start.log" 2>&1 &
  local launcher=$!
  for _ in $(seq 1 300); do
    if fleet_healthy; then
      echo "engines: fleet up — embed:$EMBED_PORT rerank:$RERANK_PORT gen:$GEN_PORT"
      echo ""
      echo "RESULT engines verb=start status=up pidfile=$PIDFILE"
      return 0
    fi
    if ! pid_alive "$launcher"; then
      if fleet_healthy; then
        echo ""
        echo "RESULT engines verb=start status=up pidfile=$PIDFILE"
        return 0
      fi
      echo "engines: launcher exited before the fleet came healthy — see $LOG_DIR/engines-start.log + vllm-*.log"
      echo ""
      echo "RESULT engines verb=start status=boot-failed log=$LOG_DIR/engines-start.log"
      return 1
    fi
    sleep 1
  done
  echo "engines: TIMEOUT waiting for the fleet — see $LOG_DIR/vllm-*.log"
  echo ""
  echo "RESULT engines verb=start status=boot-timeout"
  return 1
}

# ── stop: family group-kill by pidfile, verified against pids AND ports ───────
do_stop() {
  local killed=()
  if [ -f "$PIDFILE" ]; then
    # Group-kill each recorded engine pgid (setsid ⇒ pid == pgid).
    while read -r engine pgid _; do
      [ -z "${pgid:-}" ] && continue
      kill -TERM -- "-$pgid" 2>/dev/null && killed+=("$engine:$pgid")
    done <"$PIDFILE"
  else
    echo "engines: no pidfile — checking the ports for stragglers"
  fi
  # Bounded wait for all ports to free.
  local _
  for _ in $(seq 1 "$KILL_GRACE_TICKS"); do
    fleet_down && break
    sleep 0.5
  done
  # Any port still bound → KILL its owning process group (a straggler or a marker-less fleet).
  local p owner pgid
  for p in "${PORTS[@]}"; do
    owner="$(ss -tlnp 2>/dev/null | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1)"
    if [ -n "${owner:-}" ]; then
      pgid="$(ps -o pgid= -p "$owner" 2>/dev/null | tr -d ' ')"
      [ -n "${pgid:-}" ] && kill -KILL -- "-$pgid" 2>/dev/null && killed+=("port$p:$owner")
    fi
  done
  rm -f "$PIDFILE"
  echo "engines: stopped — killed: ${killed[*]:-none}"
  echo ""
  echo "RESULT engines verb=stop killed=${#killed[@]}"
}

# ── ensure (default `pnpm engines`): adopt-or-start + log follow ──────────────
do_ensure() {
  skip_if_disabled ensure
  if fleet_healthy; then
    echo "engines: fleet already healthy on ${PORTS[*]} — adopting (no spawn)."
  else
    do_start || return 1
  fi
  echo "engines: following logs — Ctrl-C DETACHES (the fleet stays warm; \`pnpm engines:stop\` kills it)."
  # tail -F survives log rotation; Ctrl-C ends the tail only, never the detached engines.
  exec tail -n 20 -F "$LOG_DIR/vllm-embed.log" "$LOG_DIR/vllm-rerank.log" "$LOG_DIR/vllm-gen.log" 2>/dev/null
}

case "${1:-ensure}" in
  ensure) do_ensure ;;
  start) do_start ;;
  stop) do_stop ;;
  status)
    skip_if_disabled status
    exec "$TSX" "$CTL_TS" status
    ;;
  sleep) exec "$TSX" "$CTL_TS" sleep ;;
  wake) exec "$TSX" "$CTL_TS" wake ;;
  reconcile) exec "$TSX" "$CTL_TS" reconcile ;;
  *)
    echo "usage: engines.sh {ensure|start|stop|status|sleep|wake|reconcile}"
    exit 2
    ;;
esac

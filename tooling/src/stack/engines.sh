#!/usr/bin/env bash
# ── vLLM engine FLEET front door (A.4) ───────────────────────────────────────
#
#   pnpm engines            adopt-or-start: ensure the fleet is up (detached),
#                           then tail its logs. Ctrl-C DETACHES (the fleet stays
#                           warm for the next orb) — engines stop is the only kill.
#   pnpm engines start      THE spawner: venv bootstrap → reconcile → VRAM
#                           pre-check → setsid-detached boot + pidfile. Idempotent
#                           (a healthy fleet is a no-op), so N adopters collapse to
#                           one spawn.
#   pnpm engines stop       group-kill the family by pidfile (TERM → wait → KILL),
#                           verified against the known pids AND the ports. On a clean stop (no refusals)
#                           writes the STOPPED marker (#1929) so the in-server supervisor's takeover
#                           decision does not read a dead pidfile as a crash; a real `start` clears it.
#   pnpm engines status     per-engine pid · /health · /is_sleeping · GPU tenants · hold/stopped markers.
#   pnpm engines sleep      POST /sleep?level=1 + write the hold marker.
#   pnpm engines wake       clear hold → reconcile → VRAM gate → wake + wait.
#   pnpm engines reconcile  orphan-family sweep (also runs pre-spawn).
#   pnpm engines compose    regenerate docker/compose.engines.yaml — the engine containers' compose overlay,
#                           whose serve flags come from the SAME buildEngineArgv this launcher spawns with.
#                           Spawns NOTHING (config in, one file out) and is posture-blind.
#
# ENGINES_POSTURE gates the SPAWN half of ensure/start (#1567 — the branch this script was missing):
#   off             ensure/start are a no-op
#   adopt-only      adopt a healthy fleet; with nothing to adopt, REFUSE to spawn (and say so, exit 0)
#   adopt-or-start  the default when unset — adopt if healthy, else spawn (the manager)
# Anything else REFUSES with exit 3 (misuse). stop/status/sleep/wake/reconcile are posture-blind: they
# act on whatever fleet exists, and reading is never a spawn.
#
# OWNERSHIP INVERSION: no stack owns the engines as process children anymore. The
# detached boot (engines.ts --detach) leaves each engine as its OWN setsid group
# leader and EXITS, so the fleet survives the launcher's death — the bit-us-twice
# class is unmakeable. The logic-heavy verbs (status/sleep/wake/reconcile) live in
# tooling/src/stack/ops/engines-ctl.ts (importing the server module, so the wake-budget math
# is ONE-homed); this shim owns the pgid/pidfile choreography (bash's wheelhouse)
# + the first-run venv bootstrap (must precede the ctl calls, which run on the repo node).
#
# Output contract (probe convention): the LAST line is `RESULT engines …`.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
RUN_DIR="$REPO/.cache/stack"
PIDFILE="$RUN_DIR/engines.pgid"
# #1929: the intentional-stop marker `engines stop` writes (tooling/src/stack/ops/engines-ctl.ts, the same
# home the in-server supervisor reads via @orb/server/infra/providers/vllm/engine's isStopped/fleetRunDir).
# A REAL spawn attempt below clears it — an explicit `start` is the operator/automation superseding an
# earlier stop, exactly like `engines wake` clears the hold marker before re-running its own gate.
STOPPED_MARKER="$RUN_DIR/engines.stopped"
LOG_DIR="$RUN_DIR"
# node 26 runs .ts source DIRECTLY — the same mechanism the server uses — so there is no transpiler shim
# here and no branch to pick one. This used to prefer the `tsx` binary and fall back to node only on a
# prod-pruned install, with the fallback documented as "byte-identical"; the two paths having been
# byte-identical is exactly why the preferred one was pure inheritance from before the tsx shed, and a
# dev box and the container image now run the SAME interpreter instead of differing by what happens to be
# installed. Keeping the branch also kept the variable lying: it was still called TSX while half the
# invocations were node.
RUNNER="node"
CTL_TS="$REPO/tooling/src/stack/ops/engines-ctl.ts"
COMPOSE_TS="$REPO/tooling/src/stack/ops/engines-compose.ts"
# Model/venv stores are SHARED across git worktrees (git-common-dir parent); an explicit override wins.
STORE_ROOT="${VLLM_STORE_ROOT:-$(dirname "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "$REPO/.git")")}"
VLLM_VENV="$STORE_ROOT/.cache/vllm/venv"
# The three loopback ports (env-overridable; defaults mirror foundation/env).
EMBED_PORT="${VLLM_EMBED_PORT:-8701}"
RERANK_PORT="${VLLM_RERANK_PORT:-8702}"
GEN_PORT="${VLLM_GEN_PORT:-8703}"
PORTS=("$EMBED_PORT" "$RERANK_PORT" "$GEN_PORT")

# ── ENGINES_POSTURE: the SPAWN AUTHORITY (#1567) ──────────────────────────────
# This shim — not dev.sh, not stack.sh — is the ONE place the posture decides whether a spawn may happen,
# because it is the only place a spawn is issued (`pnpm engines start` by hand routes here too, and
# dev.sh's boot is a plain call into it). Before #1567 this script read the posture NOWHERE: stack.sh
# defaulted/exported `ENGINES_POSTURE=adopt-only` (owner ruling 2026-08-01: "ADOPTS a running fleet —
# never spawns one"), dev.sh called `engines.sh start` unconditionally, and with no fleet to adopt the
# start verb cold-spawned the trio anyway (owner-witnessed 2026-09-04: 38 GB on the GPUs from a bare
# `pnpm stack restart` under an `.env`-pinned adopt-only). The posture the SERVER honoured was not the
# posture the SUPERVISOR honoured.
#
# The three members mirror the server's resolver EXACTLY (packages/server/src/foundation/env/posture.ts —
# ENGINES_POSTURES): off · adopt-only · adopt-or-start. Unset ⇒ adopt-or-start, the same default that
# resolver logs, so a hand-run `pnpm engines` is unchanged. An UNRECOGNISED value REFUSES loudly (exit 3 =
# misuse, the repo's exit-code contract) instead of falling through to a spawn — a typo'd posture must
# never read as "manage the fleet".
ENGINES_POSTURE="${ENGINES_POSTURE:-adopt-or-start}"
case "$ENGINES_POSTURE" in
  off | adopt-only | adopt-or-start) ;;
  *)
    echo "engines: ENGINES_POSTURE='$ENGINES_POSTURE' is not one of off|adopt-only|adopt-or-start — refusing." >&2
    echo ""
    echo "RESULT engines verb=${1:-ensure} status=bad-posture posture=$ENGINES_POSTURE"
    exit 3
    ;;
esac

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
    bash "$HERE/vllm-setup.sh" || {
      echo "engines: bootstrap failed — see output above."
      exit 1
    }
  fi
}

# ── start: the detached spawner (idempotent) ─────────────────────────────────
#
# THE BOOT VERDICT MUST BE HONEST (#1165). Measured on main 2026-09-02 ~15:20Z: a cold three-engine boot
# printed `status=boot-timeout` and exited 1, and all three engines answered /health within ~20s of that
# exit — `engines status` then showed every one healthy with the pidfile THIS launcher had written. So the
# 300s wait was shorter than a real cold boot (the gen model is a 27B W8A8 TP-2 load) and the exit code
# said "failed" about a fleet that came up. A caller scripting on that code re-bounces a healthy fleet.
#
# Three changes, each one an exit-code honesty rule:
#   1. the wait is sized to the MEASURED cold boot and is env-overridable (ENGINES_BOOT_TIMEOUT);
#   2. the deadline re-probes ONCE before the verdict — a fleet that is up is `booted-late` (exit 0), and
#      a real timeout NAMES the engines still down instead of a bare status;
#   3. per-engine came-up-at seconds ride the RESULT line, so the next boot's sizing is a data question.
# The launcher-exit arm is fixed with them: `engines.ts --detach` EXITS by design (the ownership
# inversion above), so its exit is only a boot failure when no detached engine survives it.
#
# ENGINES_BOOT_TIMEOUT default: 900s = 3× the 300s the measured cold boot overran. The wait costs nothing
# when the fleet is up (the loop exits on the first all-healthy probe); it only bounds the FAILURE case.
BOOT_TIMEOUT="${ENGINES_BOOT_TIMEOUT:-900}"
ENGINE_NAMES=(embed rerank gen)
# Per-engine came-up-at, in seconds since the wait began; "" until that engine first answers /health.
CAME_UP=("" "" "")
WAITED_S=0

came_up_report() {
  local i out=""
  for i in "${!ENGINE_NAMES[@]}"; do
    out="$out,${ENGINE_NAMES[$i]}=${CAME_UP[$i]:-never}"
  done
  echo "${out#,}"
}

down_engines() {
  local i out=""
  for i in "${!ENGINE_NAMES[@]}"; do
    health_ok "${PORTS[$i]}" || out="$out,${ENGINE_NAMES[$i]}:${PORTS[$i]}"
  done
  echo "${out#,}"
}

# Did the detached boot leave live engines behind? The launcher writes each engine's identity to the
# pidfile before it exits, so a live pid there means the fleet is BOOTING, not failed (the sed spelling
# mirrors stack.sh's own pidfile read — one shell, one idiom).
detached_fleet_pending() {
  [ -s "$PIDFILE" ] || return 1
  local pid
  while read -r pid; do
    pid_alive "$pid" && return 0
  done < <(sed -n 's/.*"pid"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$PIDFILE")
  return 1
}

# 0 = every engine answered inside the deadline · 1 = deadline reached · 2 = the launcher died and left
# nothing booting. Records each engine's came-up-at as it happens; $1 is the launcher pid ("" = none).
wait_for_fleet() {
  local launcher="$1" waited=0 i healthy
  while [ "$waited" -lt "$BOOT_TIMEOUT" ]; do
    healthy=1
    for i in "${!PORTS[@]}"; do
      if [ -z "${CAME_UP[$i]}" ]; then
        if health_ok "${PORTS[$i]}"; then CAME_UP[i]="${waited}s"; else healthy=""; fi
      fi
    done
    if [ -n "$healthy" ]; then
      WAITED_S="$waited"
      return 0
    fi
    if [ -n "$launcher" ] && ! pid_alive "$launcher" && ! detached_fleet_pending; then
      WAITED_S="$waited"
      return 2
    fi
    sleep 1
    waited=$((waited + 1))
  done
  WAITED_S="$waited"
  return 1
}

# The ONE re-probe the deadline owes before it calls a boot failed. Fills in the late arrivals as
# ">${BOOT_TIMEOUT}s" so the RESULT line still says which engine was the slow one.
reprobe_late() {
  local i healthy=1
  for i in "${!PORTS[@]}"; do
    if health_ok "${PORTS[$i]}"; then
      [ -z "${CAME_UP[$i]}" ] && CAME_UP[i]=">${BOOT_TIMEOUT}s"
    else
      healthy=""
    fi
  done
  [ -n "$healthy" ]
}

do_start() {
  skip_if_disabled start
  if [ "$ENGINES_POSTURE" = off ]; then
    echo "engines: ENGINES_POSTURE=off — not running the local model engines."
    echo ""
    echo "RESULT engines verb=start status=posture-off"
    return 0
  fi
  if fleet_healthy; then
    echo "engines: fleet already healthy on ${PORTS[*]} — nothing to spawn (idempotent)."
    echo ""
    echo "RESULT engines verb=start status=already-up"
    return 0
  fi
  # adopt-only: there was nothing to adopt. Say so and STOP — this is the branch whose absence spawned
  # 38 GB of vLLM under an adopt-only pin (#1567). Exit 0: "no fleet to adopt" is the posture working as
  # ruled, not a failure, and dev.sh's boot continues into a server that fails-fast per role.
  if [ "$ENGINES_POSTURE" = adopt-only ]; then
    echo "engines: adopt-only — no fleet to adopt; NOT spawning (set ENGINES_POSTURE=adopt-or-start to spawn)"
    echo ""
    echo "RESULT engines verb=start status=adopt-only-no-fleet ports=${PORTS[*]}"
    return 0
  fi
  local launcher=""
  if [ -n "${ENGINES_START_PROBE:-}" ]; then
    # The wait/verdict seam (#1165), the shell twin of engines.ts's ENGINES_DISPATCH_PROBE: NO venv
    # bootstrap, NO reconcile, NO spawn — only the loop below, against whatever the *_PORT env names.
    # It exists so the boot verdict can be driven both directions without ever touching real hardware
    # (tests/tooling/stack/ops/engines-start.int.test.ts; the standing ban is lane-standing-facts.md).
    echo "engines: START PROBE — no spawn; waiting on ${PORTS[*]} only."
  else
    # A REAL spawn attempt clears the stopped marker (#1929) — the operator/automation asked for the fleet to
    # be up, which supersedes an earlier `engines stop`. Cleared BEFORE the boot so the supervisor's next
    # tick never reads a stale "stopped intentionally" while this launch is coming up.
    rm -f "$STOPPED_MARKER"
    bootstrap_venv
    # Reconcile (orphan-family sweep) before the boot — the VRAM pre-check inside engines.ts then names a REAL
    # foreign tenant, never our own corpse.
    "$RUNNER" "$CTL_TS" reconcile >/dev/null 2>&1 || true
    # The detached boot: setsid so the LAUNCHER is its own session; engines.ts --detach boots each engine as
    # its own setsid group, writes the pidfile, and EXITS. The engines survive this shell's death (the
    # bit-us-twice fix). Run it backgrounded + wait (bounded) for the fleet to come healthy.
    echo "engines: spawning the fleet (detached) — logs in $LOG_DIR/vllm-*.log"
    setsid "$RUNNER" "$REPO/tooling/src/stack/ops/engines.ts" --detach >>"$LOG_DIR/engines-start.log" 2>&1 &
    launcher=$!
  fi

  wait_for_fleet "$launcher"
  local waited_verdict=$?
  if [ "$waited_verdict" -eq 0 ]; then
    echo "engines: fleet up in ${WAITED_S}s — embed:$EMBED_PORT rerank:$RERANK_PORT gen:$GEN_PORT"
    echo ""
    echo "RESULT engines verb=start status=up waited=${WAITED_S}s came-up=$(came_up_report) pidfile=$PIDFILE"
    return 0
  fi
  if [ "$waited_verdict" -eq 2 ]; then
    echo "engines: launcher exited after ${WAITED_S}s and no detached engine survives it — see $LOG_DIR/engines-start.log + vllm-*.log"
    echo ""
    echo "RESULT engines verb=start status=boot-failed waited=${WAITED_S}s came-up=$(came_up_report) log=$LOG_DIR/engines-start.log"
    return 1
  fi
  if reprobe_late; then
    echo "engines: fleet came up LATE — healthy on the re-probe after the ${BOOT_TIMEOUT}s wait. Raise ENGINES_BOOT_TIMEOUT if this repeats."
    echo ""
    echo "RESULT engines verb=start status=booted-late waited=${WAITED_S}s came-up=$(came_up_report) pidfile=$PIDFILE"
    return 0
  fi
  echo "engines: TIMEOUT after ${BOOT_TIMEOUT}s — still down: $(down_engines) (see $LOG_DIR/vllm-*.log)"
  echo ""
  echo "RESULT engines verb=start status=boot-timeout waited=${WAITED_S}s down=$(down_engines) came-up=$(came_up_report)"
  return 1
}

# ── stop: shared durable-identity verifier (TERM → wait → KILL) ──────────────
do_stop() {
  exec "$RUNNER" "$CTL_TS" stop
}

# ── ensure (default `pnpm engines`): adopt-or-start + log follow ──────────────
do_ensure() {
  skip_if_disabled ensure
  if fleet_healthy; then
    echo "engines: fleet already healthy on ${PORTS[*]} — adopting (no spawn)."
  else
    do_start || return 1
    # do_start can legitimately decline to spawn (posture off / adopt-only with nothing to adopt). There
    # are then no engine logs to follow, so `ensure` ends on its verdict instead of tailing empty files.
    fleet_healthy || return 0
  fi
  echo "engines: following logs — Ctrl-C DETACHES (the fleet stays warm; \`pnpm engines stop\` kills it)."
  # tail -F survives log rotation; Ctrl-C ends the tail only, never the detached engines.
  exec tail -n 20 -F "$LOG_DIR/vllm-embed.log" "$LOG_DIR/vllm-rerank.log" "$LOG_DIR/vllm-gen.log" 2>/dev/null
}

case "${1:-ensure}" in
  ensure) do_ensure ;;
  start) do_start ;;
  stop) do_stop ;;
  status)
    skip_if_disabled status
    exec "$RUNNER" "$CTL_TS" status
    ;;
  sleep) exec "$RUNNER" "$CTL_TS" sleep ;;
  wake) exec "$RUNNER" "$CTL_TS" wake ;;
  reconcile) exec "$RUNNER" "$CTL_TS" reconcile ;;
  # ORB_ENV_NO_FILE=1: the generator resolves the engine LAUNCH FLOOR from the environment, and a local
  # `.env` would bake this box's model paths into a TRACKED, shipped artifact. Skipping the file entirely
  # is what makes the committed overlay the SHIPPED defaults; the program additionally refuses if a
  # launch-floor key survives in the environment.
  # AUTH_FALLBACK=owner: foundation/env parses the WHOLE schema at import, and with no `.env` at all its
  # own AUTH_MODE default (single-user) pairs boot-fatally with AUTH_FALLBACK's (deny). This is the same
  # value vitest's config supplies for the same reason, so the drift row and this front door resolve under
  # identical env; it reaches nothing beyond a process that writes one file and exits.
  compose)
    shift
    exec env ORB_ENV_NO_FILE=1 AUTH_FALLBACK=owner "$RUNNER" "$COMPOSE_TS" "$@"
    ;;
  *)
    echo "usage: engines.sh {ensure|start|stop|status|sleep|wake|reconcile|compose}"
    exit 2
    ;;
esac

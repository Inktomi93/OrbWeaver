#!/usr/bin/env bash
# ── stack supervisor — DEV mode (server + client vite); PROD routes to stack-prod.ts ─────────────────
#
# MODE-AWARE ENTRY (see the MODE + --debug dispatch block below for the grammar):
#
#   pnpm stack up|down|restart|status [dev|prod] [--debug]
#     dev  (default)  this file — watched server + vite + engines posture, exactly as before
#     prod            scripts/dev/stack-prod.ts — detached production server, no vite, no build step
#     --debug         arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a spawn env OVERLAY (never edits .env)
#
# `up`/`down` are aliases for `start`/`stop`; the original spellings stay first-class (playwright's
# webServer, snap-stage and multi-user-fixture.sh call them by name). Everything below documents DEV mode.
#
#   bash scripts/dev/stack.sh start          boot the whole dev stack, detached
#   bash scripts/dev/stack.sh start-fg       same stack, FOREGROUND (no setsid/
#                                            pidfile) — the Playwright webServer
#                                            entrypoint; the caller supervises
#   bash scripts/dev/stack.sh stop           kill the stack it started (process
#                                            group by pgid — never pattern-kill)
#   bash scripts/dev/stack.sh restart
#   bash scripts/dev/stack.sh restart --force   (or: force-restart) NUKE then boot
#                                            — force teardown by PORT-HOLDER +
#                                            detached vLLM fleet + pidfile group,
#                                            ignoring ownership/pins, then a fresh
#                                            start where the CALLER's ENGINES_POSTURE/
#                                            VLLM_DISABLED/WIRE_CAPTURE/DEBUG_TOKEN
#                                            WIN over any pinned posture. For when the
#                                            stack is wedged (unknown-owner ports,
#                                            stale pin, accumulated detached fleets).
#   bash scripts/dev/stack.sh status         ports, pids, healthz, env pins, DB
#   bash scripts/dev/stack.sh logs [server|client] [n]
#
# DEMO DATA: `pnpm seed:demo --fresh` wipes + re-migrates the data/ db and seeds
# a verifiable demo (two humans, a solo + group chat with transcripts, a world
# book, an ingested databank doc, a preset, tags) through the REAL domain verbs —
# run it before booting the stack to always land on a populated app.
#
# WHY setsid + pidfile (ported from neo-tavern scripts/dev/stack.sh): `pkill -f`
# matches the INVOKING shell when the pattern appears in its own command line
# (agent harnesses wrap commands in bash -c) — the chain kills itself with exit
# 143. And nothing owning the ports means a second server can silently take
# 8788 and serve the wrong DB to the Vite proxy. Fix: the whole stack (dev.sh →
# tsx watch + engines owner, plus vite) lives in ONE process group; stop kills
# the group by id read from the pidfile. No patterns anywhere.
#
# BOOT ORDER (one readiness semantics): server first → poll /healthz bounded →
# THEN vite. So vite-answering == everything-ready; Playwright gates on :5173.
#
# ENV PINS: exported here with `: "${VAR:=default}"` so a host export still
# wins. VLLM_DISABLED=true maps to ENGINES_POSTURE=off (no engines in-stack;
# an explicit ENGINES_POSTURE from the caller — e.g. e2e's adopt-only — wins) ·
# AUTH_MODE=single-user · deterministic DEV-ONLY secrets so a caller flipping
# AUTH_MODE=local/oidc doesn't trip the env superRefine boot-fatality
# (packages/server/src/foundation/env/index.ts) · DEV_SEED=on, the dev twin of
# the e2e harness stamp: it keeps the default-persona seeder's auto-create arm
# ON so a DB regen never greets the operator with the FORCED first-run persona
# dialog (that dialog is the real-stack behavior). To rehearse a real first
# sign-in: `DEV_SEED=off pnpm stack restart` (host export wins).
#
# Run dir + logs live in .cache/stack/ (gitignored, never /tmp). Output
# contract (probe convention): the LAST line is a stable `RESULT stack …`
# machine line — `tail -1` lands the verdict.
#
# STACK_RUN_DIR: the pidfile+log dir, env-overridable so a SECOND stack booted
# from the SAME tree (the multi-user fixture on its offset port pair) owns its
# OWN pidfile instead of clobbering the dev stack's — `stop`/`status` read the
# pidfile, so one shared file would have `pnpm stack stop` killing the wrong
# stack. The `--isolated` snap-stage doesn't need it (it boots stack.sh from a
# SEPARATE worktree, so $REPO — and the run dir under it — already differ).
# Engines keep their own .cache/stack run dir (engines.sh); a second stack is
# engines-off by construction (VLLM_DISABLED=true), so they never collide.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
SELF="$REPO/scripts/dev/stack.sh"
RUN_DIR="${STACK_RUN_DIR:-$REPO/.cache/stack}"
PIDFILE="$RUN_DIR/stack.pgid"
LOG="$RUN_DIR/stack.log"
SERVER_LOG="$RUN_DIR/server.log"
CLIENT_LOG="$RUN_DIR/client.log"
BACKEND_PORT="${PORT:-8788}"
# VITE_PORT + VITE_API_TARGET are env-overridable (defaults = the canonical dev origin) so the
# `snap --isolated` stage can boot a SECOND isolated dev stack on offset ports (scripts/probes/_kit/
# snap-stage.ts). Exported below so the vite child (which reads them in packages/client/vite.config.ts)
# actually sees them. Unset ⇒ 5173 + this stack's own backend — byte-for-byte the old behavior.
VITE_PORT="${VITE_PORT:-5173}"
: "${VITE_API_TARGET:=http://127.0.0.1:$BACKEND_PORT}"
export VITE_PORT VITE_API_TARGET
HEALTHZ="http://127.0.0.1:$BACKEND_PORT/healthz"
# Boot readiness bounds (seconds). Under adopt-or-start the vLLM fleet cold-spawns
# DURING server boot, so the server-healthz gate has to clear a full model cold-load
# (the gen 8B alone runs well past a minute) — 60s falsely tore down a server that was
# still coming up. The wrapper readiness poll must stay AHEAD of the server gate + a
# cold vite compile (~55s) so it never declares boot-timeout while the leader is
# legitimately still booting. Override via env for slower/faster hardware.
SERVER_HEALTHZ_TIMEOUT="${SERVER_HEALTHZ_TIMEOUT:-180}"
READINESS_TIMEOUT="${READINESS_TIMEOUT:-240}"
# vLLM fleet ports (embed/rerank/gen) — force teardown polls these free after
# SIGKILLing the detached fleet. Match scripts/dev/engines.ts launch ports.
FLEET_PORTS=(8701 8702 8703)
mkdir -p "$RUN_DIR"

# ── MODE + --debug dispatch (mode-aware stack control) ───────────────────────
#
#   pnpm stack up|down|restart|status [dev|prod] [--debug]
#
# MODE is positional and OPTIONAL and defaults to `dev`, so every pre-mode call site parses to exactly
# what it always did: playwright's webServer (`stack.sh start-fg`), snap-stage's start/stop, and
# multi-user-fixture.sh are untouched. `up`/`down` are aliases of `start`/`stop`, which stay first-class
# forever — those three callers spell them by name.
#
# PROD routes the WHOLE invocation to scripts/dev/stack-prod.ts and never returns. That supervisor owns
# the production lifecycle (identity-verified adopt/stop, bounded drain watch, client-dist preflight);
# nothing below this block runs in prod mode, because prod has no vite, no engines management, and no
# dev env pins.
#
# --debug is ORTHOGONAL to mode: it arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a PROCESS ENV OVERLAY on
# the stack we are about to spawn. It NEVER edits `.env` (the workflow this replaces did, and left the
# operator to remember to strip the lines afterwards). The overlay is computed by the same TS resolver
# prod uses — including its refusal when `.env` already pins one of those keys to a conflicting value,
# which would make the flag a silent no-op (foundation/env loads `.env` with override:true).
ORIG_ARGV=("$@")
STACK_VERB="${1:-status}"
case "$STACK_VERB" in
  up) STACK_VERB=start ;;
  down) STACK_VERB=stop ;;
esac
[ "$#" -gt 0 ] && shift
STACK_MODE=dev
case "${1:-}" in
  dev | prod)
    STACK_MODE="$1"
    shift
    ;;
esac
STACK_DEBUG=""
STACK_REST=()
for arg in "$@"; do
  if [ "$arg" = "--debug" ]; then
    STACK_DEBUG=1
  else
    STACK_REST+=("$arg")
  fi
done

if [ "$STACK_MODE" = prod ]; then
  exec node "$REPO/scripts/dev/stack-prod.ts" "${ORIG_ARGV[@]}"
fi

if [ -n "$STACK_DEBUG" ]; then
  # One resolver, two modes: `debug-env` prints `KEY=value` lines (or exits non-zero with the .env
  # conflict refusal on stderr). Read with `read`, never `eval` — a token must not reach the shell parser.
  DEBUG_OVERLAY="$(node "$REPO/scripts/dev/stack-prod.ts" debug-env)" || exit 1
  while IFS='=' read -r dk dv; do
    [ -n "$dk" ] && export "$dk=$dv"
  done <<<"$DEBUG_OVERLAY"
  echo "stack: --debug armed the /api/_debug surface for this stack (env overlay; .env untouched)."
fi

set -- "$STACK_VERB" ${STACK_REST[@]+"${STACK_REST[@]}"}

# ── env pins (host export wins; `:=` only fills the gap) ─────────────────────
PIN_VARS=(VLLM_DISABLED AUTH_MODE SESSION_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD DEV_SEED)
declare -A PIN_SRC
for v in "${PIN_VARS[@]}"; do
  if [ -n "${!v:+x}" ]; then PIN_SRC[$v]=host; else PIN_SRC[$v]=pinned; fi
done
# Engine topology (A.4): if the caller set ENGINES_POSTURE (e.g. e2e's adopt-only), it wins and we pass it
# through untouched. A caller-set VLLM_DISABLED (normalized — the schema takes exactly "true"|"false", and a
# stale ambient `VLLM_DISABLED=1` from the pre-rebuild devcontainer is fatal) also wins, mapped by the env
# resolver. Otherwise the DEFAULT is ENGINES_POSTURE=adopt-only (owner ruling 2026-08-01): a bare
# `pnpm stack restart` ADOPTS a running fleet — never spawns one — so a warm fleet is usable by default.
# The old engines-off default silently unwired the vllm backend on any restart that lost the posture env
# (the 12:39 incident: saved vllm connection + bare restart = every turn dead in 2ms, zero logs).
# Engines-off is now the explicit opt-in: ENGINES_POSTURE=off or VLLM_DISABLED=true.
if [ -n "${ENGINES_POSTURE:-}" ]; then
  export ENGINES_POSTURE
elif [ -n "${VLLM_DISABLED:-}" ]; then
  case "${VLLM_DISABLED}" in
    1 | on | yes) VLLM_DISABLED=true ;;
    0 | off | no) VLLM_DISABLED=false ;;
  esac
  export VLLM_DISABLED
else
  ENGINES_POSTURE=adopt-only
  export ENGINES_POSTURE
fi
: "${AUTH_MODE:=single-user}"
# DEV-ONLY deterministic secrets — INSECURE BY DESIGN, never for a real deploy.
# They exist so AUTH_MODE=local (superRefine: SESSION_SECRET ≥32 chars +
# LOCAL_INITIAL_PASSWORD ≥8) boots without ceremony; single-user ignores them.
: "${SESSION_SECRET:=orbweaver-dev-only-session-secret-insecure}"
: "${CREDENTIALS_KEY:=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
: "${LOCAL_INITIAL_PASSWORD:=orbweaver-dev-password}"
# The dev-stack seed stamp (see ENV PINS above): a dev stack auto-seeds the default persona, so the
# FORCED first-run ask stays a real-stack behavior instead of firing on every regen.
: "${DEV_SEED:=on}"
export AUTH_MODE SESSION_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD DEV_SEED

port_pid() { ss -tlnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1; }
own_pgid() { [ -f "$PIDFILE" ] && cat "$PIDFILE" 2>/dev/null || true; }
group_alive() {
  local pgid="$1"
  [ -n "$pgid" ] && ps -eo pgid= | grep -qw "$pgid"
}
healthz_ok() { curl -sf -m 2 "$HEALTHZ" >/dev/null 2>&1; }
# `localhost`, NOT 127.0.0.1 — vite v8 binds [::1] only; the IPv4 loopback never answers.
vite_ok() { curl -sf -m 2 "http://localhost:$VITE_PORT/" >/dev/null 2>&1; }

backend_env_var() { # pid name → value (from /proc environ; keys loaded from .env at boot won't show)
  tr '\0' '\n' <"/proc/$1/environ" 2>/dev/null | grep "^$2=" | cut -d= -f2-
}

env_pin_report() {
  local bpid="$1" line="" v live
  # Engine topology: whichever of ENGINES_POSTURE / VLLM_DISABLED is set (one of them always is).
  line="$line ENGINES_POSTURE=${ENGINES_POSTURE:-—} VLLM_DISABLED=${VLLM_DISABLED:-—}"
  line="$line AUTH_MODE=${AUTH_MODE}(${PIN_SRC[AUTH_MODE]})"
  for v in SESSION_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD; do
    line="$line $v=<redacted>(${PIN_SRC[$v]})" # values are secrets — source only
  done
  echo "env pins      :${line}"
  if [ -n "$bpid" ]; then
    local lv=""
    for v in ENGINES_POSTURE VLLM_DISABLED AUTH_MODE; do
      live="$(backend_env_var "$bpid" "$v")"
      lv="$lv $v=${live:-?}"
    done
    echo "live backend  :${lv}  (from /proc/$bpid/environ)"
  fi
}

# ── the leader body — ONE source of truth for both start (setsid) and start-fg.
run_leader() {
  local server_pid="" client_pid=""
  # shellcheck disable=SC2064
  trap 'kill -TERM ${client_pid:-} ${server_pid:-} 2>/dev/null; wait 2>/dev/null; exit 0' TERM INT HUP
  echo "stack: booting server :$BACKEND_PORT (log $SERVER_LOG)"
  bash "$REPO/scripts/dev/dev.sh" >"$SERVER_LOG" 2>&1 &
  server_pid=$!
  local up=""
  for _ in $(seq 1 "$SERVER_HEALTHZ_TIMEOUT"); do
    if healthz_ok; then up=1; break; fi
    if ! kill -0 "$server_pid" 2>/dev/null; then
      echo "stack: server exited during boot — last log lines:"
      tail -15 "$SERVER_LOG"
      return 1
    fi
    sleep 1
  done
  if [ -z "$up" ]; then
    echo "stack: TIMEOUT (${SERVER_HEALTHZ_TIMEOUT}s) waiting for $HEALTHZ — last log lines:"
    tail -15 "$SERVER_LOG"
    kill -TERM "$server_pid" 2>/dev/null
    return 1
  fi
  echo "stack: server healthy — booting client vite :$VITE_PORT (log $CLIENT_LOG)"
  # Explicit bin + exec (the dev.sh trick) — NOT `pnpm --filter @orb/client dev`: the pnpm
  # intermediary does not forward TERM to vite, so foreground teardown would orphan :5173.
  (cd "$REPO/packages/client" && exec "$REPO/packages/client/node_modules/.bin/vite") >"$CLIENT_LOG" 2>&1 &
  client_pid=$!
  # Hold the group open; if EITHER child dies, tear the other down (a half-up
  # stack is worse than a down one — the vite proxy would 502 or serve stale).
  wait -n 2>/dev/null
  echo "stack: a child exited — tearing down the stack"
  kill -TERM "$client_pid" "$server_pid" 2>/dev/null
  wait 2>/dev/null
  return 1
}

do_stop() {
  local pgid
  pgid="$(own_pgid)"
  if [ -z "$pgid" ] || ! group_alive "$pgid"; then
    rm -f "$PIDFILE"
    echo "stack: nothing to stop (no live pidfile group)"
    echo ""
    echo "RESULT stack status=stopped pgid=none"
    return 0
  fi
  kill -TERM -- "-$pgid" 2>/dev/null
  for _ in $(seq 1 30); do
    group_alive "$pgid" || break
    sleep 0.5
  done
  if group_alive "$pgid"; then
    echo "stack: group $pgid ignored TERM, escalating to KILL"
    kill -KILL -- "-$pgid" 2>/dev/null
    sleep 1
  fi
  rm -f "$PIDFILE"
  echo "stack: stopped (pgid $pgid)"
  echo ""
  echo "RESULT stack status=stopped pgid=$pgid"
}

# ── FORCE teardown (--force only) ────────────────────────────────────────────
# Ignores ownership + pidfile: kills whatever HOLDS our ports and the full
# DETACHED vLLM fleet (which survives the manager's death), then verifies release.
# Kills only orbweaver's OWN procs (:8788 server, :5173 vite, the .cache/vllm/venv
# fleet, the pidfile group) — never a broad node/python sweep, never the qemu VM.
# Kills by EXPLICIT PID (not a group that could contain the invoking shell) except
# the pidfile group, which by construction is the setsid leader tree (not us).

# vLLM fleet cmdline signatures — the detached procs the manager-kill misses.
FLEET_PATTERNS='scripts/dev/engines\.ts|\.cache/vllm/venv|VLLM::EngineCore|EngineCore|Worker_TP'

fleet_pids() {
  # Drop the grep we just spawned (its own cmdline carries the pattern) via a
  # negative match on the ps/grep pipeline itself, then emit pids.
  ps -eo pid=,cmd= | /usr/bin/grep -aE "$FLEET_PATTERNS" | /usr/bin/grep -av 'pid=,cmd=' \
    | awk '$0 !~ /grep -aE/ {print $1}'
}

gpu_idle() { # true when every GPU's used VRAM is below the idle floor (~1GiB)
  local used
  while read -r used; do
    [ -z "$used" ] && continue
    [ "$used" -gt 1024 ] && return 1
  done < <(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null)
  return 0
}

force_teardown() {
  local pgid bpid vpid pid p
  echo "force-restart: TEARDOWN — ignoring ownership + pidfile"

  # 1) Port holders (server :8788, vite :5173) by holder PID, regardless of owner.
  bpid="$(port_pid "$BACKEND_PORT")"
  vpid="$(port_pid "$VITE_PORT")"
  for pid in "$bpid" "$vpid"; do
    if [ -n "$pid" ]; then
      echo "force-restart: killing port holder pid $pid"
      kill -KILL "$pid" 2>/dev/null
    fi
  done

  # 2) The stack process group, if a pidfile group is still alive (setsid leader
  #    tree — never the invoking shell).
  pgid="$(own_pgid)"
  if group_alive "$pgid"; then
    echo "force-restart: killing stack group pgid $pgid"
    kill -KILL -- "-$pgid" 2>/dev/null
  fi

  # 3) The FULL detached vLLM fleet (survives manager death) — SIGKILL by cmdline.
  local fp
  fp="$(fleet_pids)"
  if [ -n "$fp" ]; then
    echo "force-restart: SIGKILL vLLM fleet pids: $fp"
    # shellcheck disable=SC2086 # word-split intentional: kill a list of pids
    kill -KILL $fp 2>/dev/null
  fi

  # 4) Drop the stale pidfile.
  rm -f "$PIDFILE"

  # 5) POLL until ports free AND VRAM idle — SIGKILL releases sockets/VRAM with a
  #    few-second LAG, so verify, don't assume.
  local free
  for _ in $(seq 1 30); do
    free=1
    for p in "$BACKEND_PORT" "$VITE_PORT" "${FLEET_PORTS[@]}"; do
      [ -n "$(port_pid "$p")" ] && free=""
    done
    [ -n "$(fleet_pids)" ] && free=""
    if [ -n "$free" ] && gpu_idle; then
      echo "force-restart: teardown complete — ports free, GPU idle"
      return 0
    fi
    sleep 1
  done
  echo "force-restart: WARNING — after 30s teardown poll, some resource not fully released:"
  for p in "$BACKEND_PORT" "$VITE_PORT" "${FLEET_PORTS[@]}"; do
    pid="$(port_pid "$p")"
    [ -n "$pid" ] && echo "force-restart:   :$p still held by pid $pid"
  done
  gpu_idle || echo "force-restart:   GPU VRAM still above idle floor"
  return 0 # proceed to start regardless — a lagging release usually clears during boot
}

do_status() {
  local pgid bpid vpid health
  pgid="$(own_pgid)"
  bpid="$(port_pid "$BACKEND_PORT")"
  vpid="$(port_pid "$VITE_PORT")"
  health="$(healthz_ok && echo ok || echo unreachable)"
  echo "pidfile group : ${pgid:-—} $(group_alive "${pgid:-x}" && echo '(alive)' || echo '(dead)')"
  echo "server :$BACKEND_PORT  : pid ${bpid:-not bound} · healthz $health"
  echo "vite   :$VITE_PORT  : pid ${vpid:-not bound}"
  env_pin_report "${bpid:-}"
  echo "logs          : $LOG · $SERVER_LOG · $CLIENT_LOG"
  local state="down"
  if [ "$health" = "ok" ] && [ -n "$vpid" ]; then
    state="up"
  elif [ -n "$bpid" ] || [ -n "$vpid" ]; then
    state="partial"
  fi
  echo ""
  echo "RESULT stack status=$state server-pid=${bpid:-0} healthz=$health vite-pid=${vpid:-0} pidfile=${pgid:-none}"
}

preflight() { # refuses ports owned by a stack we don't know about (idempotent start)
  local bpid vpid pgid
  pgid="$(own_pgid)"
  bpid="$(port_pid "$BACKEND_PORT")"
  vpid="$(port_pid "$VITE_PORT")"
  [ -z "$bpid" ] && [ -z "$vpid" ] && return 0
  if group_alive "$pgid"; then
    echo "stack: already running (pgid $pgid) — use 'restart', or 'status' to inspect"
    echo ""
    echo "RESULT stack status=already-up pgid=$pgid"
    return 2
  fi
  echo "stack: ports busy (server=$bpid vite=$vpid) but NOT owned by this script ($PIDFILE)."
  echo "stack: refusing to fight an unknown owner — inspect with 'status', stop it yourself."
  echo ""
  echo "RESULT stack status=port-conflict server-pid=${bpid:-0} vite-pid=${vpid:-0} pidfile=$PIDFILE"
  return 1
}

do_start() {
  # --force skips the ownership preflight entirely — force_teardown already freed
  # the ports, and the whole point of force is to NOT refuse an unknown owner.
  if [ -z "${FORCE:-}" ]; then
    preflight
    local pf=$?
    [ "$pf" = 2 ] && return 0
    [ "$pf" = 1 ] && return 1
  fi

  : >"$LOG"
  # setsid: new session ⇒ new process group whose PGID == the leader's PID.
  # The leader (this script, `_leader` verb — env pins ride the export) owns
  # dev.sh + vite; one number kills the whole tree.
  (cd "$REPO" && exec setsid bash "$SELF" _leader) >>"$LOG" 2>&1 &
  local leader=$!
  echo "$leader" >"$PIDFILE"
  echo "stack: booting (pgid $leader, log $LOG)…"

  # Readiness = vite answering (the leader gates server-healthz BEFORE vite, so
  # vite-up ⇒ everything-up). Bounded by READINESS_TIMEOUT, which stays ahead of the
  # SERVER_HEALTHZ_TIMEOUT gate + a cold tsx/vite compile (~55s) — otherwise the
  # wrapper false-times-out while the leader is still legitimately booting the fleet.
  for _ in $(seq 1 "$READINESS_TIMEOUT"); do
    sleep 1
    if vite_ok && healthz_ok; then
      echo "stack: up — server :$BACKEND_PORT (healthz ok) · vite :$VITE_PORT"
      echo ""
      echo "RESULT stack status=up pgid=$leader log=$LOG"
      return 0
    fi
    if ! group_alive "$leader"; then
      echo "stack: process group died during boot — leader log:"
      tail -20 "$LOG"
      rm -f "$PIDFILE"
      echo ""
      echo "RESULT stack status=boot-failed log=$LOG"
      return 1
    fi
  done
  echo "stack: TIMEOUT waiting for readiness — leader log:"
  tail -20 "$LOG"
  echo ""
  echo "RESULT stack status=boot-timeout pgid=$leader log=$LOG"
  return 1
}

do_force_restart() {
  # NUKE everything (ports + detached fleet + pidfile group, ignoring ownership),
  # then boot fresh. Because we actually kill the old server, the CALLER's env
  # (ENGINES_POSTURE/VLLM_DISABLED/WIRE_CAPTURE/DEBUG_TOKEN — all resolved at the
  # top of this script, host export winning over the `:=` pin defaults) is what
  # the NEW server starts under: the stale pinned posture cannot survive a real
  # restart. Pinned SECRETS (SESSION_SECRET/CREDENTIALS_KEY/…) still default in.
  FORCE=1
  # dev.sh → engines.sh gates the in-stack fleet on VLLM_DISABLED, not ENGINES_POSTURE.
  # A caller who forces ENGINES_POSTURE=off means "no engines" — bridge it to
  # VLLM_DISABLED=true (the documented off⇔disabled mapping) so the fresh boot
  # does NOT cold-spawn a fleet the caller just tore down. The exported var is
  # inherited by the setsid leader re-exec (and by dev.sh under it). Force-only:
  # normal start/restart are untouched. Non-off postures reach engines.sh as before.
  if [ "${ENGINES_POSTURE:-}" = off ]; then export VLLM_DISABLED=true; fi
  echo "force-restart: caller posture — ENGINES_POSTURE=${ENGINES_POSTURE:-—} VLLM_DISABLED=${VLLM_DISABLED:-—} (wins over any pin)"
  force_teardown
  do_start
  local rc=$?
  # Confirm what ACTUALLY took by reading the live backend's /proc environ — the
  # env resolver exports ENGINES_POSTURE (VLLM_DISABLED=true maps to off), so it's
  # present in the new server's environ.
  local bpid live vd
  bpid="$(port_pid "$BACKEND_PORT")"
  if [ -n "$bpid" ]; then
    live="$(backend_env_var "$bpid" ENGINES_POSTURE)"
    if [ -z "$live" ]; then
      vd="$(backend_env_var "$bpid" VLLM_DISABLED)"
      [ "$vd" = true ] && live="off(via VLLM_DISABLED)"
    fi
    echo "force-restart: live backend ENGINES_POSTURE=${live:-?}"
  fi
  return $rc
}

do_start_fg() {
  # Playwright's webServer entrypoint: no setsid, no pidfile — the caller owns
  # and reaps the child tree. Same leader body, same ordering, same env pins.
  preflight || return 1 # already-up ALSO fails here: fg must own what it boots
  run_leader
}

do_logs() {
  local n="${2:-40}"
  case "${1:-both}" in
    server) tail -n "$n" "$SERVER_LOG" ;;
    client) tail -n "$n" "$CLIENT_LOG" ;;
    both)
      echo "── leader ($LOG) ──" && tail -n "$n" "$LOG"
      echo "── server ($SERVER_LOG) ──" && tail -n "$n" "$SERVER_LOG"
      echo "── client ($CLIENT_LOG) ──" && tail -n "$n" "$CLIENT_LOG"
      ;;
    *)
      echo "usage: stack.sh logs [server|client] [n]"
      return 2
      ;;
  esac
}

case "${1:-status}" in
  start) do_start ;;
  start-fg) do_start_fg ;;
  _leader) run_leader ;; # internal: the setsid re-exec target — not for humans
  stop) do_stop ;;
  restart)
    if [ "${2:-}" = "--force" ]; then
      do_force_restart
    else
      do_stop
      do_start
    fi
    ;;
  force-restart) do_force_restart ;; # alias for `restart --force`
  status) do_status ;;
  logs) shift; do_logs "$@" ;;
  *)
    echo "usage: stack.sh {up|start|start-fg|down|stop|restart [--force]|force-restart|status|logs [server|client] [n]} [dev|prod] [--debug]"
    exit 2
    ;;
esac

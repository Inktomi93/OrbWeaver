#!/usr/bin/env bash
# ── stack supervisor — DEV mode (server + client vite); PROD routes to stack-prod.ts ─────────────────
#
# MODE-AWARE ENTRY (see the MODE + --debug dispatch block below for the grammar):
#
#   pnpm stack up|start-fg|down|restart|status [dev|prod] [--debug]
#     dev  (default)  this file — watched server + vite + engines posture, exactly as before
#     prod            tooling/src/stack/ops/prod-entry.ts — detached production server, no vite, no build step
#     start-fg prod   tooling/src/stack/ops/prod-entry.ts — the production server in the FOREGROUND (this terminal
#                     owns it, Ctrl-C stops it, no pidfile) — the on-box direct run that replaced `pnpm start`
#     --debug         arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a spawn env OVERLAY (never edits .env)
#
# `up`/`down` are aliases for `start`/`stop`; the original spellings stay first-class (playwright's
# webServer, snap-stage and multi-user-fixture.sh call them by name). Everything below documents DEV mode.
#
#   bash tooling/src/stack/stack.sh start          boot the whole dev stack, detached
#   bash tooling/src/stack/stack.sh start-fg       same stack, FOREGROUND (no setsid/
#                                            pidfile) — the Playwright webServer
#                                            entrypoint; the caller supervises
#   bash tooling/src/stack/stack.sh stop           kill the stack it started (process
#                                            group by pgid — never pattern-kill)
#   bash tooling/src/stack/stack.sh restart
#   bash tooling/src/stack/stack.sh restart --force   (or: force-restart) NUKE then boot
#                                            — force teardown by PORT-HOLDER +
#                                            detached vLLM fleet + pidfile group,
#                                            ignoring ownership/pins, then a fresh
#                                            start where the CALLER's ENGINES_POSTURE/
#                                            VLLM_DISABLED/WIRE_CAPTURE/DEBUG_TOKEN
#                                            WIN over any pinned posture. For when the
#                                            stack is wedged (unknown-owner ports,
#                                            stale pin, accumulated detached fleets).
#   bash tooling/src/stack/stack.sh status         ports, pids, healthz, SERVED-MODULE freshness, env pins
#   bash tooling/src/stack/stack.sh logs [server|client] [n]
#
# DEMO DATA: `pnpm seed:demo --fresh` wipes + re-migrates the data/ db and seeds
# a verifiable demo (two humans, a solo + group chat with transcripts, a world
# book, an ingested databank doc, a preset, tags) through the REAL domain verbs —
# run it before booting the stack to always land on a populated app.
#
# WHY setsid + pidfile (ported from the previous codebase’s scripts/dev/stack.sh): `pkill -f`
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
# an explicit ENGINES_POSTURE from the caller — e.g. e2e's adopt-only — wins,
# then the `.env` pin, then the adopt-only default; every boot path prints the
# effective posture AND which of the three it came from — #1567) ·
# AUTH_MODE=single-user · deterministic DEV-ONLY secrets so a caller flipping
# AUTH_MODE=local/oidc doesn't trip the env superRefine boot-fatality
# (packages/server/src/foundation/env/index.ts) · DEV_SEED=on, the dev twin of
# the e2e harness stamp: it keeps the default-persona seeder's auto-create arm
# ON so a DB regen never greets the operator with the FORCED first-run persona
# dialog (that dialog is the real-stack behavior). To rehearse a real first
# sign-in: `DEV_SEED=off pnpm stack restart` (host export wins).
#
# Run dir + logs live in .cache/stack/ (gitignored, never /tmp). Each boot
# ROTATES the previous run's log to `<log>.1` instead of truncating it (#524:
# a restart that destroys the evidence of why you restarted). Output
# contract (probe convention): the LAST line is a stable `RESULT stack …`
# machine line — `tail -1` lands the verdict.
#
# STATUS HONESTY (#524): `status` also probes what vite is SERVING against what
# is on disk (`served=` on the RESULT line). A dead vite file watcher leaves the
# pid alive, the port bound and healthz green while every page load gets a
# pre-change transform — 24 minutes of white screens once read as `status=up`.
# A stale transform makes the verdict `degraded`, which is the ONLY status state
# that exits non-zero; `down`/`partial`/`up` still exit 0 as they always did.
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
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
SELF="$REPO/tooling/src/stack/stack.sh"
RUN_DIR="${STACK_RUN_DIR:-$REPO/.cache/stack}"
# A RELATIVE override is resolved against $REPO, not against whoever's cwd invoked us. The vite child is
# started as `(cd packages/client && exec vite) >"$CLIENT_LOG"`, where the redirection is opened BEFORE the
# subshell's cd — so a relative log path silently lands in a different directory depending on the caller.
# The e2e mode projects pass `./.cache/e2e/<mode>/stack` (tests/e2e/support/modes.ts) exactly like their
# DATABASE_URL/ASSETS_DIR, so this is the line that makes that spelling mean what it reads as.
case "$RUN_DIR" in /*) ;; *) RUN_DIR="$REPO/${RUN_DIR#./}" ;; esac
PIDFILE="$RUN_DIR/stack.pgid"
LOG="$RUN_DIR/stack.log"
SERVER_LOG="$RUN_DIR/server.log"
CLIENT_LOG="$RUN_DIR/client.log"
BACKEND_PORT="${PORT:-8788}"
# VITE_PORT + VITE_API_TARGET are env-overridable (defaults = the canonical dev origin) so the
# `snap --isolated` stage can boot a SECOND isolated dev stack on offset ports (tooling/src/snap/
# ops/stage.ts). Exported below so the vite child (which reads them in packages/client/vite.config.ts)
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
# The DEFAULTS are LOAD-SCALED and derived by node, never spelled here (#1232, docs/design/
# 1208-instrument-substrate.md section 7.1 — the ONE budget policy lives at
# tooling/src/_shared/load-budget.ts and the shell half is tooling/src/stack/lib/boot-budgets.ts). A
# host export still WINS: these two stay empty here and `apply_boot_budgets` fills only what the
# operator did not set. Derived lazily, on the boot paths alone, so `status`/`down` pay no node spawn.
SERVER_HEALTHZ_TIMEOUT="${SERVER_HEALTHZ_TIMEOUT:-}"
READINESS_TIMEOUT="${READINESS_TIMEOUT:-}"
apply_boot_budgets() {
  [ -n "${BOOT_BUDGETS_APPLIED:-}" ] && return 0
  BOOT_BUDGETS_APPLIED=1
  local out
  out="$(node "$REPO/tooling/src/stack/ops/prod-entry.ts" boot-budgets)" || exit 2
  while IFS='=' read -r bk bv; do
    [ -z "$bk" ] && continue
    case "$bk" in
      SERVER_HEALTHZ_TIMEOUT) [ -z "$SERVER_HEALTHZ_TIMEOUT" ] && SERVER_HEALTHZ_TIMEOUT="$bv" ;;
      READINESS_TIMEOUT) [ -z "$READINESS_TIMEOUT" ] && READINESS_TIMEOUT="$bv" ;;
    esac
  done <<<"$out"
}
# vLLM fleet ports (embed/rerank/gen) — force teardown polls these free after SIGKILLing the detached
# fleet. Read through the SAME env vars engines.sh uses (same literal fallbacks, since bash can't import
# foundation/env): a bare literal list here silently ignored a VLLM_*_PORT override, so teardown polled
# ports the fleet never bound and reported the fleet gone while it was still holding VRAM.
FLEET_PORTS=("${VLLM_EMBED_PORT:-8701}" "${VLLM_RERANK_PORT:-8702}" "${VLLM_GEN_PORT:-8703}")
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
# PROD routes the WHOLE invocation to tooling/src/stack/ops/prod-entry.ts and never returns — INCLUDING `start-fg
# prod`, the FOREGROUND on-box run (`NODE_ENV=production node <entry>.ts` in this terminal, no pidfile)
# that replaced `pnpm start`. That supervisor owns the production lifecycle (identity-verified adopt/stop,
# bounded drain watch, client-dist preflight, and the foreground run); nothing below this block runs in
# prod mode, because prod has no vite, no engines management, and no dev env pins.
#
# --debug is ORTHOGONAL to mode: it arms DEBUG_TOKEN/WIRE_CAPTURE/RPG_TRACE as a PROCESS ENV OVERLAY on
# the stack we are about to spawn. It NEVER edits `.env` (the workflow this replaces did, and left the
# operator to remember to strip the lines afterwards). The overlay is computed by the same TS resolver
# prod uses — including its refusal when `.env` already pins one of those keys to a conflicting value,
# which would make the flag a silent no-op (foundation/env loads `.env` with override:true).
# ONE GRAMMAR, AND THE SHELL DOES NOT OWN IT. Everything after this comment is decided by
# `parseStackArgv` (tooling/src/stack/lib/argv.ts) via the `classify` verb — the same parser
# tests/tooling/stack-mode.test.ts pins. The shell only switches on its answer.
#
# WHY (paid for by a driven counterexample, 2026-08-07): the first version of this block classified in
# bash and accepted a mode ONLY in argument position 2. Everything it did not recognise FELL THROUGH TO
# DEV — silently. `up --debug prod` armed debug on the DEV stack; `up --nope` ran dev with the flag
# dropped on the floor; and `restart --force prod` reached `do_force_restart`, which SIGKILLs whatever
# holds :8788/:5173 **and the entire detached vLLM fleet**, drops the pidfile, and boots DEV — a
# destructive verb executed against the mode the operator did not ask for. Unit tests could not see any
# of it, because the shell decided before the parser was ever called.
#
# So: nothing falls through. An unclassifiable invocation exits 2 with usage and touches nothing.
ORIG_ARGV=("$@")
STACK_DISPATCH="$(node "$REPO/tooling/src/stack/ops/prod-entry.ts" classify -- "$@")" || exit 2
STACK_VERB=status
STACK_MODE=dev
STACK_DEBUG=""
STACK_FORCE=""
STACK_REST=()
while IFS='=' read -r dkey dval; do
  case "$dkey" in
    verb) STACK_VERB="$dval" ;;
    mode) STACK_MODE="$dval" ;;
    debug) STACK_DEBUG="$dval" ;;
    force) STACK_FORCE="$dval" ;;
    rest) STACK_REST+=("$dval") ;;
  esac
done <<<"$STACK_DISPATCH"

# Test seam (tests/tooling/stack-dispatch.int.test.ts): print the classification and stop, so the
# dispatch can be driven without spawning a stack or execing the prod supervisor. Deliberately AFTER
# classification and BEFORE any action — that is the surface under test.
if [ -n "${STACK_DISPATCH_PROBE:-}" ]; then
  echo "DISPATCH verb=$STACK_VERB mode=$STACK_MODE debug=${STACK_DEBUG:-0} force=${STACK_FORCE:-0} rest=${STACK_REST[*]-}"
  exit 0
fi

if [ "$STACK_MODE" = prod ]; then
  exec node "$REPO/tooling/src/stack/ops/prod-entry.ts" "${ORIG_ARGV[@]}"
fi

if [ -n "$STACK_DEBUG" ]; then
  # One resolver, two modes: `debug-env` prints `KEY=value` lines (or exits non-zero with the .env
  # conflict refusal on stderr). Read with `read`, never `eval` — a token must not reach the shell parser.
  DEBUG_OVERLAY="$(node "$REPO/tooling/src/stack/ops/prod-entry.ts" debug-env)" || exit 1
  while IFS='=' read -r dk dv; do
    [ -n "$dk" ] && export "$dk=$dv"
  done <<<"$DEBUG_OVERLAY"
  echo "stack: --debug armed the /api/_debug surface for this stack (env overlay; .env untouched)."
fi

# Rebuild argv in the shape the case-dispatch below already understands. `--force` is re-attached as a
# FLAG (never re-derived here) — the parser is what decided it, including that `force-restart` implies it
# and that `--force` is refused outright in prod mode.
set -- "$STACK_VERB" ${STACK_FORCE:+--force} ${STACK_REST[@]+"${STACK_REST[@]}"}

# ── env pins (host export wins; `:=` only fills the gap) ─────────────────────
PIN_VARS=(VLLM_DISABLED AUTH_FALLBACK AUTH_MODE SESSION_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD DEV_SEED)
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
#
# THE SOURCE RIDES THE VALUE (#1567). "adopt-only" printed with no provenance is what let a spawn hide in
# plain sight: the supervisor's posture and the SERVER's posture are resolved by different code, and the
# server re-reads `.env` with override:true AFTER spawn. So we resolve host → .env pin → default here,
# record which one won in ENGINES_POSTURE_SRC, and print both on every boot (`posture_report`).
ENGINES_POSTURE_SRC=""
env_file_posture() { # the `.env` pin, if any — the value the SERVER's resolver will actually see
  [ -f "$REPO/.env" ] || return 0
  sed -n 's/^[[:space:]]*ENGINES_POSTURE[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*/\1/p' "$REPO/.env" | tail -1
}
ENV_FILE_POSTURE="$(env_file_posture)"
#
# ONE POSTURE VARIABLE ALWAYS REACHES engines.sh (#1618 — the #1567 spawn through its SECOND door).
# The old shape branched on `VLLM_DISABLED` being NON-EMPTY, which is true of `false`/`0`/`no` as well:
# such a caller set NO `ENGINES_POSTURE`, SKIPPED the `.env` pin below, and engines.sh — which reads only
# `ENGINES_POSTURE` — fell back to its own `adopt-or-start` default and SPAWNED, while the server ran
# `.env`'s adopt-only. The branch's own comment claimed the caller "gets the mapping the server's resolver
# applies", and that was the false premise: the server's resolver is not in this path at all.
# So: a TRUTHY VLLM_DISABLED maps EXPLICITLY to `ENGINES_POSTURE=off` (the documented off⇔disabled
# mapping, now spelled where engines.sh can see it), and a FALSY one normalises and FALLS THROUGH to the
# `.env` pin / default exactly like unset — because "vllm is not disabled" says nothing about which of
# off/adopt-only/adopt-or-start the operator wants.
# CASE-INSENSITIVE, and that is a SAFETY property, not a nicety (verifier v-L2-tooling, #1618 residual):
# the case-sensitive first cut read `VLLM_DISABLED=TRUE` as falsy, then the else-branch below REWROTE it to
# `false` and exported it — an operator who spelled the spawn-safety switch in caps had their stated intent
# silently inverted, on the one variable whose whole job is "do not start 38 GB of vLLM". `${x,,}` is a bash
# 4 expansion; this script is already bash-only (arrays above).
vllm_disabled_truthy() {
  case "${VLLM_DISABLED:-}" in
    "") return 1 ;;
    *)
      case "${VLLM_DISABLED,,}" in
        1 | on | yes | true) return 0 ;;
        *) return 1 ;;
      esac
      ;;
  esac
}
if [ -n "${ENGINES_POSTURE:-}" ]; then
  ENGINES_POSTURE_SRC=host
  export ENGINES_POSTURE
elif vllm_disabled_truthy; then
  # Normalized because the server's env schema takes exactly "true"|"false" (a stale ambient
  # `VLLM_DISABLED=1` from the pre-rebuild devcontainer is fatal), and mapped to the posture so the
  # supervisor and the server agree without either guessing.
  VLLM_DISABLED=true
  ENGINES_POSTURE=off
  ENGINES_POSTURE_SRC="VLLM_DISABLED=true"
  export VLLM_DISABLED ENGINES_POSTURE
else
  # A falsy VLLM_DISABLED is normalised for the schema and then IGNORED as a posture input.
  if [ -n "${VLLM_DISABLED:-}" ]; then
    VLLM_DISABLED=false
    export VLLM_DISABLED
  fi
  if [ -n "$ENV_FILE_POSTURE" ]; then
    # The .env pin is what the server will run under regardless of what we pass; the supervisor honouring a
    # DIFFERENT posture is exactly the #1567 split (an .env-pinned adopt-only that still cold-spawned 38 GB
    # of vLLM, owner-witnessed 2026-09-04). Adopt it so one posture governs both halves. Today's `.env` pins
    # adopt-only, which is also the default below — so this branch changes no VALUE, only its provenance…
    # and the provenance is the half that decides whether engines.sh may spawn.
    ENGINES_POSTURE="$ENV_FILE_POSTURE"
    ENGINES_POSTURE_SRC=.env
  else
    ENGINES_POSTURE=adopt-only
    ENGINES_POSTURE_SRC=default
  fi
  export ENGINES_POSTURE
fi

# Test seam, the posture twin of STACK_DISPATCH_PROBE (#1618): print what engines.sh will actually receive
# and stop, so the RESOLUTION can be driven without spawning a stack or a single vLLM process. Deliberately
# AFTER the posture block and BEFORE any action — that is the surface under test
# (tests/tooling/stack/index.int.test.ts). The standing ban on running the real launcher is
# .claude/rules/lane-standing-facts.md.
if [ -n "${STACK_POSTURE_PROBE:-}" ]; then
  echo "POSTURE engines=${ENGINES_POSTURE:-—} source=${ENGINES_POSTURE_SRC:-—} vllm-disabled=${VLLM_DISABLED:-—} env-pin=${ENV_FILE_POSTURE:-—}"
  exit 0
fi

# The one posture line every boot path prints BEFORE it boots (up · restart · force-restart · start-fg).
# It names the effective value, where it came from, and — when a host export is overriding an .env pin —
# the value the server itself will resolve, which is the pair that made #1567 invisible.
posture_report() {
  local line="stack: engines posture ${ENGINES_POSTURE:-—} (${ENGINES_POSTURE_SRC:-via VLLM_DISABLED=${VLLM_DISABLED:-—}})"
  if [ "$ENGINES_POSTURE_SRC" = host ] && [ -n "$ENV_FILE_POSTURE" ] && [ "$ENV_FILE_POSTURE" != "${ENGINES_POSTURE:-}" ]; then
    line="$line — NOTE: .env pins ENGINES_POSTURE=$ENV_FILE_POSTURE and the server re-reads .env with override:true, so the SERVER will run $ENV_FILE_POSTURE"
  fi
  echo "$line"
}
# #2406: the env schema resolves an unset AUTH_FALLBACK per mode — `owner` under single-user (its only
# credential), `deny` under every SSO mode — so this pin RESTATES what the server would reach anyway; it is
# no longer what keeps a dev stack out of the #1864 flat-`deny` boot fatal. Kept so the stack's own env
# report names the value instead of implying it. A caller-set value wins (`:=`).
: "${AUTH_FALLBACK:=owner}"
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
export AUTH_FALLBACK AUTH_MODE SESSION_SECRET CREDENTIALS_KEY LOCAL_INITIAL_PASSWORD DEV_SEED

port_pid() { ss -tlnp 2>/dev/null | grep ":$1 " | grep -oP 'pid=\K[0-9]+' | head -1; }
own_pgid() {
  if [ -f "$PIDFILE" ]; then
    sed -n 's/^[[:space:]]*"pgid":[[:space:]]*\([0-9][0-9]*\),*$/\1/p' "$PIDFILE" | head -1
  fi
}
dev_identity() { node "$REPO/tooling/src/stack/ops/dev-identity-entry.ts" "$@"; }
group_alive() { dev_identity probe >/dev/null 2>&1; }
# THE LAUNCH MARKER (#1013). Exported before the setsid leader is spawned, so EVERY member of the resulting
# process group inherits it in its environment; `dev-identity-entry.ts capture` records the leader's copy
# into the pidfile. It is what makes a leaderless SURVIVOR identifiable — a live pid in the recorded group
# carrying this exact token was started by THIS launch and by nothing else — which is what let stop/status/
# start stop refusing over their own tree (four receipts in one session, 2026-09-01). A kernel uuid: 122
# bits, unguessable, and never reused across boots. `date`+`$$` is the fallback for a kernel without the
# uuid node; it is weaker but still per-launch, and the reader validates the shape either way.
mint_launch_id() {
  if [ -r /proc/sys/kernel/random/uuid ]; then
    cat /proc/sys/kernel/random/uuid
    return 0
  fi
  echo "orb-$(date +%s%N)-$$"
}
healthz_ok() { curl -sf -m 2 "$HEALTHZ" >/dev/null 2>&1; }
# `localhost`, NOT 127.0.0.1 — vite v8 binds [::1] only; the IPv4 loopback never answers.
vite_ok() { curl -sf -m 2 "http://localhost:$VITE_PORT/" >/dev/null 2>&1; }

# ROTATE, never truncate (#524). A restart used to `>` each log, which DESTROYS THE EVIDENCE OF WHY YOU
# RESTARTED: the 15:57 restart that fixed the dead-vite-watcher wedge wiped the 15:33-15:56 window from
# client.log, and the investigation lost its only primary source. One generation back is enough — the reason
# you restarted is always in the run you just ended.
rotate_log() {
  [ -s "$1" ] && mv -f "$1" "$1.1" 2>/dev/null
  : >"$1"
}

backend_env_var() { # pid name → value (from /proc environ; keys loaded from .env at boot won't show)
  tr '\0' '\n' <"/proc/$1/environ" 2>/dev/null | grep "^$2=" | cut -d= -f2-
}

env_pin_report() {
  local bpid="$1" line="" v live
  # Engine topology: whichever of ENGINES_POSTURE / VLLM_DISABLED is set (one of them always is).
  line="$line ENGINES_POSTURE=${ENGINES_POSTURE:-—}(${ENGINES_POSTURE_SRC:-—}) VLLM_DISABLED=${VLLM_DISABLED:-—}"
  # AUTH_MODE here is the SHELL pin (this script's `:=`/host export) — it does NOT account for a checked-in
  # `.env`, which the server loads with override:true and which therefore WINS. The `effective` line below is
  # the truth; this one is only "what the launcher intended". (#301 — the pin line used to be read as gospel.)
  line="$line AUTH_MODE=${AUTH_MODE}(${PIN_SRC[AUTH_MODE]} shell-pin)"
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
    # NOTE: /proc/environ is the SPAWN env — it too misses a .env override (the server reads .env AFTER spawn).
    echo "live backend  :${lv}  (from /proc/$bpid/environ — SPAWN env, also pre-.env-override)"
    # THE EFFECTIVE mode: the server's own resolved config (post-.env-override), read from the anonymous
    # /api/auth/config probe. This is the ONLY honest answer to "what AUTH_MODE is actually running" — if it
    # differs from the shell-pin/spawn lines above, a checked-in .env overrode them (#301).
    local eff_mode
    eff_mode="$(curl -sf -m 2 "http://127.0.0.1:$BACKEND_PORT/api/auth/config" 2>/dev/null | sed -n 's/.*"mode":"\([^"]*\)".*/\1/p')"
    echo "effective     : AUTH_MODE=${eff_mode:-?}  (server /api/auth/config — RESOLVED after .env override; the truth if it differs above)"
  fi
}

# A TERM the child never acts on is how the boot-failure path leaked an orphan (#1567): the leader
# TERM'd dev.sh and returned, dev.sh was blocked in engines.sh with the signal QUEUED, and the moment the
# leader died it reparented to `systemd --user` and went on to bind :8788 under a dead pidfile group.
# dev.sh's own signal handler is fixed to exit; this is the leader's half — VERIFY the child is gone, and
# escalate to KILL rather than trust a signal we never confirmed. Bash's BUILTIN kill only (never procps:
# a negative pgid trips its argument parser), and only ever on our own child pid.
reap_child() { # pid label → TERM, bounded wait, then KILL
  local pid="$1" label="$2" i
  [ -n "$pid" ] || return 0
  kill -TERM "$pid" 2>/dev/null
  for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  echo "stack: $label (pid $pid) ignored TERM after 10s — escalating to KILL"
  kill -KILL "$pid" 2>/dev/null
  return 0
}

# ── the leader body — ONE source of truth for both start (setsid) and start-fg.
run_leader() {
  local server_pid="" client_pid=""
  # shellcheck disable=SC2064
  trap 'kill -TERM ${client_pid:-} ${server_pid:-} 2>/dev/null; wait 2>/dev/null; exit 0' TERM INT HUP
  posture_report
  echo "stack: booting server :$BACKEND_PORT (log $SERVER_LOG)"
  rotate_log "$SERVER_LOG"
  bash "$REPO/tooling/src/stack/dev.sh" >"$SERVER_LOG" 2>&1 &
  server_pid=$!
  local up=""
  apply_boot_budgets
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
    reap_child "$server_pid" dev.sh
    return 1
  fi
  echo "stack: server healthy — booting client vite :$VITE_PORT (log $CLIENT_LOG)"
  # Explicit bin + exec (the dev.sh trick) — NOT `pnpm --filter @orb/client dev`: the pnpm
  # intermediary does not forward TERM to vite, so foreground teardown would orphan :5173.
  # `--configLoader native` duplicates @orb/client's own `dev` script flag ON PURPOSE: the loader
  # choice is CLI-only BY CONSTRUCTION (it decides how vite.config.ts is loaded, so it cannot live
  # inside that file), and this exec bypasses the package script entirely. Both vite entry points in
  # this repo — the package scripts and this line — must carry it or dev and CI load the config two
  # different ways. Node 26 executes the TS config directly; the default `bundle` loader would
  # Rolldown-bundle it into node_modules/.vite-temp first.
  rotate_log "$CLIENT_LOG"
  (cd "$REPO/packages/client" && exec "$REPO/packages/client/node_modules/.bin/vite" --configLoader native) >"$CLIENT_LOG" 2>&1 &
  client_pid=$!
  # Hold the group open; if EITHER child dies, tear the other down (a half-up
  # stack is worse than a down one — the vite proxy would 502 or serve stale).
  wait -n 2>/dev/null
  echo "stack: a child exited — tearing down the stack"
  reap_child "$client_pid" vite
  reap_child "$server_pid" dev.sh
  wait 2>/dev/null
  return 1
}

# Poll until the recorded group has no members left — the honest end of a teardown. Returns 0 the moment
# the group is empty, 1 if it still holds a member after the grace (which is when the survivors alarm is
# TRUE). `clear-absent` is the only thing that can answer "is the group empty" without asserting ownership.
GROUP_SETTLE_TICKS=20
wait_group_gone() {
  for _ in $(seq 1 "$GROUP_SETTLE_TICKS"); do
    dev_identity clear-absent >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  return 1
}

do_stop() {
  local pgid
  pgid="$(own_pgid)"
  if [ -z "$pgid" ]; then
    if [ -f "$PIDFILE" ]; then
      echo "stack: refusing malformed dev-stack identity $PIDFILE — manual cleanup required"
      return 1
    fi
    echo "stack: nothing to stop (no live pidfile group)"
    echo ""
    echo "RESULT stack status=stopped pgid=none"
    return 0
  fi
  if ! dev_identity signal SIGTERM; then
    # A DEPARTED leader is no longer the end of the road (#1013 receipt 2/4): if every live member of the
    # recorded group carries this launch's marker, the group is provably ours and gets the same TERM.
    # `adopt-signal` refuses anything it cannot prove, so an unmarked or foreign group still stops here.
    if ! dev_identity adopt-signal SIGTERM; then
      echo "stack: refusing to stop unverified group $pgid — manual cleanup required"
      return 1
    fi
    echo "stack: adopted the leaderless group $pgid by its launch marker (the recorded leader is gone)"
  fi
  for _ in $(seq 1 30); do
    group_alive "$pgid" || break
    sleep 0.5
  done
  if group_alive "$pgid"; then
    echo "stack: group $pgid ignored TERM, escalating to KILL"
    if ! dev_identity signal SIGKILL && ! dev_identity adopt-signal SIGKILL; then
      echo "stack: refusing KILL after identity changed — manual cleanup required"
      return 1
    fi
  fi
  # RE-READ AFTER THE KILL SETTLES (#1013 receipt 3). A single `sleep 1` then one verdict is what printed
  # "still has verified survivors after KILL" over a group whose members were already gone by the time the
  # line reached the terminal. Poll instead: the alarm below now describes the tree at the moment it fires.
  if ! wait_group_gone >/dev/null; then
    # An ADOPTED group needs its own escalation: `group_alive` above can only ask about a LIVE leader, so a
    # leaderless-but-adopted group skips the KILL branch entirely and would otherwise be reported as
    # uncleanable after a TERM it merely ignored. Refusals here stay silent — the verdict below prints them.
    dev_identity adopt-signal SIGKILL >/dev/null 2>&1 && wait_group_gone >/dev/null
  fi
  # #1162: this line used to CLAIM verified survivors on the strength of a verdict that only ever said
  # "the leader is gone". clear-absent now asks the group itself (kill -0 on the pgid, the pgrep -g
  # question) and only refuses when a member really outlived the leader — so we print ITS verdict here
  # instead of asserting one. See tooling/src/stack/ops/dev-identity-entry.ts.
  local clear_verdict
  if ! clear_verdict="$(dev_identity clear-absent)"; then
    echo "stack: group $pgid could not be cleared after KILL — manual cleanup required"
    echo "stack: $clear_verdict"
    return 1
  fi
  echo "stack: stopped (pgid $pgid)"
  echo ""
  echo "RESULT stack status=stopped pgid=$pgid"
}

# ── FORCE teardown (--force only) ────────────────────────────────────────────
# Force means verified escalation, never guessed ownership. The manager and detached engines each route
# through their durable identity verifier; foreign port holders are left untouched and block the restart.

# The GPU occupancy probe answers THREE things, not two (#1495). The old body ran nvidia-smi inside a
# process substitution feeding `while read`: a MISSING or ERRORING probe produced zero rows, the loop body
# never ran, and control fell through to an unconditional `return 0` — so force_teardown printed
# "teardown complete — ports free, GPU idle" over VRAM that was never measured at all. The probe's failure
# was byte-identical to its success. Exit codes, and every caller must branch on all four:
#   0  idle          every GPU reported and all are under the floor
#   1  busy          a GPU reported above the floor
#   2  UNKNOWN       the probe ran and failed, printed nothing, or printed a non-number — NEVER idle
#   3  not measured  nvidia-smi is absent from PATH, or the operator opted out. A host with no NVIDIA
#                    tooling holds no fleet VRAM, so it must still be able to force-restart; that is a
#                    DIFFERENT fact from "the driver is there and would not answer", which is 2.
GPU_IDLE_FLOOR_MIB=1024
gpu_idle() {
  if [ "${STACK_GPU_CHECK:-on}" = skip ]; then
    echo "stack: GPU idle check SKIPPED (STACK_GPU_CHECK=skip) — VRAM was NOT measured" >&2
    return 3
  fi
  command -v nvidia-smi >/dev/null 2>&1 || return 3
  local out used rc=0 rows=0
  # Captured, never piped: the exit STATUS is half the answer, and a pipeline would hand back the reader's.
  out="$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null)" || rc=$?
  [ "$rc" != 0 ] && return 2
  while read -r used; do
    [ -z "$used" ] && continue
    case "$used" in *[!0-9]*) return 2 ;; esac
    rows=$((rows + 1))
    [ "$used" -gt "$GPU_IDLE_FLOOR_MIB" ] && return 1
  done <<<"$out"
  # A probe that answered with no rows measured no GPU — the exact shape that used to read as idle.
  [ "$rows" -eq 0 ] && return 2
  return 0
}

# What a gpu_idle code says out loud. One home, so the completion line and the refusal cannot disagree.
gpu_state_text() {
  case "$1" in
    0) echo "GPU idle" ;;
    1) echo "GPU busy — VRAM above the ${GPU_IDLE_FLOOR_MIB}MiB idle floor" ;;
    2) echo "GPU UNKNOWN — nvidia-smi could not be read; refusing to call it idle (STACK_GPU_CHECK=skip proceeds without it)" ;;
    *) echo "GPU not measured (no nvidia-smi on PATH, or STACK_GPU_CHECK=skip)" ;;
  esac
}

# Test seam (tests/tooling/stack/index.int.test.ts), the `STACK_DISPATCH_PROBE` convention: print the GPU
# verdict and stop. It is the ONLY way to drive the probe's FAILURE arms — its one caller is force_teardown,
# which SIGKILLs the live stack and the vLLM fleet before it ever asks. Deliberately after the definition
# and before any action, so nothing is spawned and no port is touched.
if [ -n "${STACK_GPU_PROBE:-}" ]; then
  gpu_idle
  gpu_probe_code=$?
  echo "GPU code=$gpu_probe_code text=$(gpu_state_text "$gpu_probe_code")"
  exit 0
fi

force_teardown() {
  local pid p
  echo "force-restart: TEARDOWN — verified ownership only"
  do_stop || return 1
  node "$REPO/tooling/src/stack/ops/engines-ctl.ts" stop || return 1

  # POLL until ports free AND the GPU is either idle or honestly not measurable. UNKNOWN (2) never
  # satisfies this loop: an unreadable probe is a reason to keep waiting and then REFUSE, never a pass.
  local free gpu
  for _ in $(seq 1 30); do
    free=1
    for p in "$BACKEND_PORT" "$VITE_PORT" "${FLEET_PORTS[@]}"; do
      [ -n "$(port_pid "$p")" ] && free=""
    done
    gpu_idle
    gpu=$?
    if [ -n "$free" ] && { [ "$gpu" = 0 ] || [ "$gpu" = 3 ]; }; then
      echo "force-restart: teardown complete — ports free, $(gpu_state_text "$gpu")"
      return 0
    fi
    sleep 1
  done
  echo "force-restart: REFUSED — after 30s a foreign or unreleased resource remains:" >&2
  for p in "$BACKEND_PORT" "$VITE_PORT" "${FLEET_PORTS[@]}"; do
    pid="$(port_pid "$p")"
    [ -n "$pid" ] && echo "force-restart:   :$p still held by pid $pid"
  done
  gpu_idle
  gpu=$?
  [ "$gpu" != 0 ] && [ "$gpu" != 3 ] && echo "force-restart:   $(gpu_state_text "$gpu")" >&2
  return 1
}

# The SERVED-MODULE probe (#524) — the one question a pid + a healthz cannot answer: is vite serving the
# code that is ON DISK? A dead file watcher keeps the process up, the port bound and healthz green while
# every load gets a pre-change transform (measured: 24 minutes of white screens under `status=up`). The
# decision is node's (ops/served-probe.ts, same bash-fronted rule as `classify`); the shell only reads the
# machine line + the exit code. Echoes ONE `state|file|reason` line (the caller splits it) — never partly to
# stderr, which would interleave ahead of the status block under command substitution.
served_probe() {
  local out rc state file reason
  out="$(VITE_PORT="$VITE_PORT" node "$REPO/tooling/src/stack/ops/prod-entry.ts" served-probe 2>/dev/null)"
  rc=$?
  # A probe that CRASHED is not a verdict — never let a broken instrument read as a healthy stack, and never
  # let it read as a wedged one either (exit 2 is the tool-error class).
  if [ "$rc" != 0 ] && [ "$rc" != 1 ]; then
    echo "unverifiable|none|the served-module probe itself failed (exit $rc) — freshness NOT measured"
    return "$rc"
  fi
  state="$(printf '%s\n' "$out" | /usr/bin/grep -a -m1 '^SERVED ' | sed -n 's/.*state=\([a-z-]*\).*/\1/p')"
  file="$(printf '%s\n' "$out" | /usr/bin/grep -a -m1 '^SERVED ' | sed -n 's/.*file=\([^ ]*\).*/\1/p')"
  reason="$(printf '%s\n' "$out" | /usr/bin/grep -av '^SERVED ' | head -1)"
  echo "${state:-unverifiable}|${file:-none}|${reason}"
}

do_status() {
  local pgid bpid vpid health
  pgid="$(own_pgid)"
  bpid="$(port_pid "$BACKEND_PORT")"
  vpid="$(port_pid "$VITE_PORT")"
  health="$(healthz_ok && echo ok || echo unreachable)"
  echo "pidfile group : ${pgid:-—} $(group_alive "${pgid:-x}" && echo '(alive)' || echo '(dead)')"
  # WHAT WAS VERIFIED, AND HOW (#1013 receipt 1): the pidfile NUMBER told the operator nothing — a group id
  # from a different era read exactly like the live one. This line names the evidence behind the verdict.
  echo "ownership     : $(dev_identity describe 2>/dev/null | sed -n 's/^DESCRIBE dev-stack //p' || echo 'basis=unreadable')"
  echo "server :$BACKEND_PORT  : pid ${bpid:-not bound} · healthz $health"
  echo "vite   :$VITE_PORT  : pid ${vpid:-not bound}"
  local served="unverifiable" served_file="none" served_reason="vite is not bound — freshness NOT measured"
  if [ -n "$vpid" ]; then
    local probe rest
    local probe_rc=0
    probe="$(served_probe)" || probe_rc=$?
    served="${probe%%|*}"
    rest="${probe#*|}"
    served_file="${rest%%|*}"
    served_reason="${rest#*|}"
  fi
  echo "served module : $served · $served_file"
  echo "              : $served_reason"
  env_pin_report "${bpid:-}"
  echo "logs          : $LOG · $SERVER_LOG · $CLIENT_LOG"
  local state="down"
  if [ "$health" = "ok" ] && [ -n "$vpid" ]; then
    # DEGRADED is `up` with a lie in it: the ports answer, so every pre-#524 signal reads healthy, but the
    # code being served is not the code on disk. It is the ONE state that exits non-zero — `down`/`partial`
    # stay exit 0 exactly as before, so no existing caller changes meaning.
    if [ "$served" = "fresh" ]; then state="up"; else state="degraded"; fi
  elif [ -n "$bpid" ] || [ -n "$vpid" ]; then
    state="partial"
  fi
  echo ""
  echo "RESULT stack status=$state server-pid=${bpid:-0} healthz=$health vite-pid=${vpid:-0} served=$served pidfile=${pgid:-none}"
  if [ "$state" = "degraded" ]; then
    [ "${probe_rc:-0}" -gt 1 ] && return "$probe_rc"
    return 1
  fi
  return 0
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

  posture_report
  rotate_log "$LOG"
  # setsid: new session ⇒ new process group whose PGID == the leader's PID.
  # The leader (this script, `_leader` verb — env pins ride the export) owns
  # dev.sh + vite; one number kills the whole tree.
  # …and the launch marker rides the same export, so every process in that tree carries proof of WHICH
  # launch started it — the evidence the pgid alone could never give (#1013).
  ORB_STACK_LAUNCH_ID="$(mint_launch_id)"
  export ORB_STACK_LAUNCH_ID
  (cd "$REPO" && exec setsid bash "$SELF" _leader) >>"$LOG" 2>&1 &
  local leader=$!
  if ! dev_identity capture "$leader"; then
    echo "stack: leader $leader could not be durably identified — refusing unmanaged boot; manual cleanup required"
    return 1
  fi
  echo "stack: booting (pgid $leader, log $LOG)…"

  # Readiness = vite answering (the leader gates server-healthz BEFORE vite, so
  # vite-up ⇒ everything-up). Bounded by READINESS_TIMEOUT, which stays ahead of the
  # SERVER_HEALTHZ_TIMEOUT gate + a cold tsx/vite compile (~55s) — otherwise the
  # wrapper false-times-out while the leader is still legitimately booting the fleet.
  apply_boot_budgets
  for _ in $(seq 1 "$READINESS_TIMEOUT"); do
    sleep 1
    if vite_ok && healthz_ok; then
      echo "stack: up — server :$BACKEND_PORT (healthz ok) · vite :$VITE_PORT"
      echo ""
      echo "RESULT stack status=up pgid=$leader log=$LOG"
      return 0
    fi
    if ! group_alive "$leader"; then
      # #1013 receipt 4: the leader died mid-boot while the DETACHED tree carried on healthy, and this
      # branch printed "refusing cleanup; manual inspection required" over a stack that was still running
      # — the worst state, since nothing could ever own it again. The marked group is OURS, so adopt it
      # and stop it; only a group we cannot prove is ours still refuses.
      if ! dev_identity adopt-signal SIGTERM >/dev/null 2>&1; then
        echo "stack: leader died during boot and its group is NOT provably ours — refusing cleanup; manual inspection required"
        dev_identity describe || true
        return 1
      fi
      if ! wait_group_gone; then
        echo "stack: adopted the boot-dead leader's group but it did not exit — manual cleanup required"
        return 1
      fi
      if ! dev_identity clear-absent >/dev/null; then
        echo "stack: launch identity became ambiguous during boot — refusing cleanup; manual inspection required"
        return 1
      fi
      echo "stack: process group died during boot — leader log:"
      tail -20 "$LOG"
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
  # engines.sh honours ENGINES_POSTURE itself since #1567, so `off` no longer NEEDS the bridge — we keep
  # it because VLLM_DISABLED=true is also what the SERVER's deprecated-input path maps to `off`, and a
  # caller who forces off after a teardown must not have the fleet re-spawned by either half. The exported
  # var is inherited by the setsid leader re-exec (and by dev.sh under it). Force-only: normal
  # start/restart are untouched. Non-off postures reach engines.sh as before.
  if [ "${ENGINES_POSTURE:-}" = off ]; then export VLLM_DISABLED=true; fi
  echo "force-restart: caller posture — ENGINES_POSTURE=${ENGINES_POSTURE:-—}(${ENGINES_POSTURE_SRC:-—}) VLLM_DISABLED=${VLLM_DISABLED:-—} (wins over any pin)"
  force_teardown || return 1
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

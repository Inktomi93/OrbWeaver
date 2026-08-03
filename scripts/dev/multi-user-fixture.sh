#!/usr/bin/env bash
# ── two-human local dev fixture (side-eye task #89) ──────────────────────────
#
# Boots orb as a REAL multi-human deployment so the invite / bell-inbox / People-panel / `/join`
# surfaces render LIVE — no client-side fetch-mocking. It is a thin ENV RECIPE over the existing
# `scripts/dev/stack.sh` (NOT a parallel stack system): it exports AUTH_MODE=local + a SEPARATE DB /
# ASSETS dir under .cache/ (so the normal single-user dev DB is never touched), starts the stack, then
# runs `multi-user-seed.ts` to flip the `LOCAL_MULTI_USER` AppSetting on and mint a second account.
#
#   bash scripts/dev/multi-user-fixture.sh up       boot the fixture + seed (owner + member, LOCAL_MULTI_USER on)
#   bash scripts/dev/multi-user-fixture.sh down      stop the stack (leaves the fixture DB on disk)
#   bash scripts/dev/multi-user-fixture.sh reset     stop + DELETE the fixture DB/assets (next `up` is fresh)
#   bash scripts/dev/multi-user-fixture.sh seed       re-run the seed against an already-running fixture (idempotent)
#   bash scripts/dev/multi-user-fixture.sh status     stack.sh status
#
# CREDENTIALS (dev-only, insecure by design):
#   owner  : owner  / owner-dev-pass      (box owner; seeded from LOCAL_INITIAL_PASSWORD on first boot)
#   member : member / member-dev-pass     (regular user; minted via admin.createUser during seed)
#
# PORTS — an OFFSET PAIR (8790 server / 5175 vite), not stack.sh's 8788/5173 (changed 2026-08-03).
# The fixture is now a SIDECAR: it runs ALONGSIDE the owner's dev stack instead of instead-of it, the
# same recipe every e2e mode uses (tests/e2e/support/modes.ts: own ports + own DB + own assets). Three
# things are isolated, and all three are required for coexistence:
#   • ports    — PORT/VITE_PORT/VITE_API_TARGET (this file is the ONE source of truth; the snap side
#                mirrors them by hand in scripts/probes/_kit/fixture.ts, same as the credentials).
#   • data     — DB + assets under .cache/multi-user-fixture/ (never the dev ./data/orbweaver.db).
#   • pidfile  — STACK_RUN_DIR (stack.sh's env hook): the fixture's pgid/logs live under its own dir, so
#                `pnpm stack stop` can never kill the fixture, nor this script the dev stack.
# Override the pair with FIXTURE_PORT / FIXTURE_VITE_PORT if something else already owns 8790/5175
# (pass the SAME values to snap via --fixture-server/--fixture-base or SNAP_FIXTURE_*_URL).
#
# VERIFY it's live:  curl -s http://127.0.0.1:8790/api/auth/config   → "multiHumanCapable":true
# Log in as either credential at http://localhost:5175 to exercise invite → notification → accept.
# Snap it with two authenticated humans:  pnpm snap / --contexts 2 --text

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="$REPO/scripts/dev/stack.sh"
FIXTURE_DIR="$REPO/.cache/multi-user-fixture"

# ── the offset port pair (see PORTS above) — exported so stack.sh + its vite child bind THESE ────────
export PORT="${FIXTURE_PORT:-8790}"
export VITE_PORT="${FIXTURE_VITE_PORT:-5175}"
export VITE_API_TARGET="http://127.0.0.1:$PORT"
# stack.sh's pidfile/log dir (its STACK_RUN_DIR hook) — the fixture owns its own, so the two stacks'
# stop/status verbs never target each other's process group.
export STACK_RUN_DIR="$FIXTURE_DIR/stack"

# ── the fixture's env contract — the ONE source of truth the seed script inherits ────────────────────
export AUTH_MODE=local
export DATABASE_URL="file:./.cache/multi-user-fixture/orb.db"
export ASSETS_DIR="./.cache/multi-user-fixture/assets"
export VLLM_DISABLED=true
# DEV-ONLY deterministic secrets (insecure by design — never a real deploy). ≥32 chars for the
# local-mode superRefine (SESSION_SECRET) + ≥8 for the owner seed (LOCAL_INITIAL_PASSWORD).
export SESSION_SECRET="orbweaver-multi-user-fixture-session-secret-insecure"
export CREDENTIALS_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
export LOCAL_INITIAL_PASSWORD="owner-dev-pass"
# Make our exports win over any future checked-in .env (foundation/env's .env loader runs with
# override:true; this escape hatch flips it to override:false so the shell recipe stands).
export ORB_ENV_NO_OVERRIDE=1

# The seed's contract (base URL + the four credentials) — passed through so the two files never drift.
export SEED_BASE_URL="http://127.0.0.1:$PORT"
export FIXTURE_OWNER_HANDLE=owner
export FIXTURE_OWNER_PASSWORD="$LOCAL_INITIAL_PASSWORD"
export FIXTURE_MEMBER_HANDLE=member
export FIXTURE_MEMBER_PASSWORD="member-dev-pass"

exec_seed() { "$REPO/node_modules/.bin/tsx" "$REPO/scripts/dev/multi-user-seed.ts"; }

do_up() {
  mkdir -p "$FIXTURE_DIR/assets" "$STACK_RUN_DIR"
  echo "fixture: booting the two-human stack on :$PORT/:$VITE_PORT (DB $DATABASE_URL)…"
  if ! bash "$STACK" start; then
    echo "fixture: stack failed to start — see the RESULT line above (something else owns :$PORT/:$VITE_PORT? set FIXTURE_PORT/FIXTURE_VITE_PORT)."
    return 1
  fi
  echo "fixture: stack healthy — seeding LOCAL_MULTI_USER + the member account…"
  exec_seed
}

case "${1:-up}" in
  up) do_up ;;
  seed) exec_seed ;;
  down) bash "$STACK" stop ;;
  status) bash "$STACK" status ;;
  reset)
    bash "$STACK" stop
    rm -rf "$FIXTURE_DIR"
    echo "fixture: reset — deleted $FIXTURE_DIR (next 'up' is a fresh two-human box)"
    ;;
  *)
    echo "usage: multi-user-fixture.sh {up|down|reset|seed|status}"
    exit 2
    ;;
esac

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
# PORTS: the same 8788 (server) / 5173 (vite) stack.sh owns — so run this INSTEAD of the normal
# `pnpm stack` (stop that first; stack.sh refuses to fight ports it doesn't own). The isolation that
# matters is the DB: this fixture's data lives in .cache/multi-user-fixture/, the normal stack's in
# ./orbweaver.db — they never collide.
#
# VERIFY it's live:  curl -s http://127.0.0.1:8788/api/auth/config   → "multiHumanCapable":true
# Log in as either credential at http://localhost:5173 to exercise invite → notification → accept.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STACK="$REPO/scripts/dev/stack.sh"
FIXTURE_DIR="$REPO/.cache/multi-user-fixture"

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
# Make our exports win over any future checked-in .env (foundation/env loads dotenv with override:true;
# this escape hatch flips it to override:false so the shell recipe stands). Harmless today (no .env exists).
export ORB_ENV_NO_OVERRIDE=1

# The seed's contract (base URL + the four credentials) — passed through so the two files never drift.
export SEED_BASE_URL="http://127.0.0.1:8788"
export FIXTURE_OWNER_HANDLE=owner
export FIXTURE_OWNER_PASSWORD="$LOCAL_INITIAL_PASSWORD"
export FIXTURE_MEMBER_HANDLE=member
export FIXTURE_MEMBER_PASSWORD="member-dev-pass"

exec_seed() { "$REPO/node_modules/.bin/tsx" "$REPO/scripts/dev/multi-user-seed.ts"; }

do_up() {
  mkdir -p "$FIXTURE_DIR/assets"
  echo "fixture: booting the two-human stack (DB $DATABASE_URL)…"
  if ! bash "$STACK" start; then
    echo "fixture: stack failed to start — see the RESULT line above (stop the normal 'pnpm stack' first if ports are busy)."
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

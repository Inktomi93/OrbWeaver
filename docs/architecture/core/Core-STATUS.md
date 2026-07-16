---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — build status & handoff

> **Cursor only** — where the build is and what's next. Law + doc index: `AGENTS.md` §7 (read that
> first). Phase state (one line each): `Core-BUILD-PLAN.md`. Dated narrative history:
> `../history/build-plan-record.md`.

## Where we are

Build is at Phase 6+ (see `Core-BUILD-PLAN.md` for the phase table). **The core-product backend is
BUILT** (verified corpus-wide 2026-07-13 — chat engine incl. the pending\_turns defer/drain lane,
multiplayer, all six provider backends + the turn-shaping axis, search/discovery/stats, portability);
what's unbuilt backend-side is the parked future programs + short tails, all mapped in
`../proposed/INDEX.md`. **Current lane:** `../proposed/ui-cohesion-north-star.md` (D66 UI-cohesion
program — the remaining work is predominantly frontend). **Ledger cursor: D77**
(`Core-Path-Registry.md` — D75 debug-surface read-only · D76 healthz minimal · D77 ingress XFF-only + empty-403).

## Verify

- `pnpm check` — the full gate suite (static).
- `pnpm test` — `vitest run --project unit --project integration --project integration-serial --project contract`.

## NEXT ACTION

The north-star lanes (PP1–PP5 → N1–N5) + the §6 board; burn down `ready` rows in
`Core-Audits-and-Debt.md` opportunistically; the D60 seat wave (AP3-2 voicing chain — the six-item
order is in `../proposed/INDEX.md`) when a backend lane is wanted.

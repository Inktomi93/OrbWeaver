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

Build is at Phase 6+ (see `Core-BUILD-PLAN.md` for the phase table). **Current lane:**
`../proposed/ui-cohesion-north-star.md` (D66 UI-cohesion program). **Ledger cursor: D67**
(`anth-direct`, `Core-Path-Registry.md`).

## Verify

- `pnpm check` — the full gate suite (static).
- `pnpm test` — `vitest run --project unit --project integration --project integration-serial --project contract`.

## NEXT ACTION

Burn down the `ready` rows in `Core-Audits-and-Debt.md`, finish Phase-6 client feature surfaces
(current lane above), then the D60 seat wave (AP3+).

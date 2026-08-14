---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — build status & handoff

> **⚠ BUILD-STATE RIDER (truth audit 2026-08-03): this cursor is FROZEN at 2026-07-13 — pre-retro.** Project 1 owns current work; `docs/retro-workboard.md` is only the recovery index. Known drift below, verified against the tree: the ledger cursor is **D120** (D121 pending merge), not D106; the backend set is FIVE (`BACKEND_KEYS`: agent-sdk · openrouter · vllm · local-light · custom-openai — `anth-direct` was purged in the 2026-07-22 retro sync, so "all six provider backends" is stale); `domain/hub`, `buddy`, `crew`, `expressions`, and the agent-principal machinery (D60 AP0–AP2) were purged with the burn-down, while `automation`, `plugin`, `databank`, `imagery`, `tool-use`, and `rpg` are BUILT; the D66 ui-cohesion "current lane" and the D60 seat-wave NEXT ACTION are superseded. Body below kept as the 07-13 record.

> **Cursor only** — where the build is and what's next. Law + doc index: `AGENTS.md` §7 (read that
> first). Phase state (one line each): `../history/Core-BUILD-PLAN.md` (superseded). Dated narrative history:
> `../history/build-plan-record.md`.

## Where we are

Build was at Phase 6+ at this snapshot (see `../history/Core-BUILD-PLAN.md` for the frozen phase table). **The core-product backend is
BUILT** (verified corpus-wide 2026-07-13 — chat engine incl. the pending\_turns defer/drain lane,
multiplayer, all six provider backends + the turn-shaping axis, search/discovery/stats, portability);
what's unbuilt backend-side is the parked future programs + short tails, all mapped in
`../proposed/INDEX.md`. **Current lane:** `../proposed/ui-cohesion-north-star.md` (D66 UI-cohesion
program — the remaining work is predominantly frontend). **Ledger cursor: D106**
(`Core-Path-Registry.md` — D75 debug-surface read-only · D76 healthz minimal · D77 ingress XFF-only +
empty-403 · D78 autosave-form factory session boundary · D106 chat read-visibility presence-interval
clamp; D79–D105 RESERVED for main-era rulings pending re-mint, see `Core-Path-Registry.md`).

## Verify

- `pnpm check` — the full gate suite (static).
- `pnpm test` — `vitest run --project unit --project integration --project integration-serial --project contract`.

## NEXT ACTION

The north-star lanes (PP1–PP5 → N1–N5) + the §6 board; burn down `ready` rows in
`Core-Audits-and-Debt.md` opportunistically; the D60 seat wave (AP3-2 voicing chain — the six-item
order is in `../proposed/INDEX.md`) when a backend lane is wanted.

---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: testing
plan: test-foundation
---

# Select immediate-send behavior in the CYOA click-send capstone

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`MAIN-AF3-CYOASETUP-001`: Configure cyoaChoiceBehavior as send and verify that setting before clicking a choice. Preserve the native user commit and new assistant reply assertions.

Inspect `tests/e2e/live-parity-plus-capstone.spec.ts`, `tests/e2e/support/trpc.ts`, `packages/server/src/domain/rpg/game-mint.ts`, `packages/contracts/src/rpg/config.ts`.

## Why

`MAIN-AF3-CYOASETUP-001`: The case enables choices but leaves the default compose behavior, which fills the draft without sending.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`MAIN-AF3-CYOASETUP-001`: The immediate-send case observes a new user message and assistant reply. Preserve the default compose behavior and exact row assertions.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.

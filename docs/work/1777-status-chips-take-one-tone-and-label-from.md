---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: type-law
---

# Status chips take one tone and label from a typed verdict or status union, so no raw wire word or local tone map reaches a chip

## What

Make a status chip take its tone and label from a typed verdict or status union, so a raw wire word or a local tone map cannot reach a chip.

## Why

packages/client/src/features/refinery/lib/verdict.ts keys VERDICT_TONE and VERDICT_WORD by plain strings and falls back to neutral or the raw spelling. The tuple already exists as REFINERY_VERDICTS in packages/contracts/src/refinery/core.ts, and the sessions-roster row types latestVerdict from it, so the maps can be keyed by RefineryVerdict. A new member or a stray wire word reaches a chip with no compile error.

## Done when

VERDICT_TONE and VERDICT_WORD are Records keyed by RefineryVerdict, and verdictToneOf and verdictWordOf take a RefineryVerdict. Adding a member without a tone and a word fails the typecheck, and no chip receives a bare string. The other status chips are listed in the Evidence with the union each one uses.

## Evidence

Filled at landing: what ran and where its output is.

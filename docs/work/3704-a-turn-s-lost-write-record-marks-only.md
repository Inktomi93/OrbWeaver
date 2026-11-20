---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: rpg
---

# A turn's lost-write record marks only the calls whose writes were replaced

## What

When a concurrent turn's writes lose to a later turn, every call in the losing turn gets the overridden verdict, including an upsert_quest whose quest is still in the state, because markMergeLosses in packages/contracts/src/rpg/extraction.ts attributes the loss per turn.

## Why

A record that marks a kept write as lost points the user at the wrong call.

## Done when

Only the calls whose written paths the later turn replaced carry the overridden verdict, with a test where one call's write survives.

## Evidence

Filled at landing: what ran and where its output is.

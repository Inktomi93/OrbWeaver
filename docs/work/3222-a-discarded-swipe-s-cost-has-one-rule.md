---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: stats
plan: stats-and-spend
---

# A discarded swipe's cost has one rule on the live and rebuild paths

## What

The comment above `foldCanonSwipe` in `packages/server/src/domain/stats/substrate/rebuild-rollups.ts` says unselected legs retain spend, while `variantUsageLegDelta` in `packages/contracts/src/stats/index.ts` clears every cost field when the leg is not selected. Settle which rule is right, state it in one place, and follow it on both paths.

## Why

Spend already paid is real money, and the live and rebuilt totals must agree on what a discarded swipe cost.

## Done when

A test pins the cost of a discarded swipe on the live path and after a rebuild, and the comment matches the delta.

## Evidence

Filled at landing: what ran and where its output is.

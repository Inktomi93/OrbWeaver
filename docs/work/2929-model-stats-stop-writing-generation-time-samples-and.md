---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# Model stats stop writing generation-time samples and drop the column

## What

`model_stats.gen_samples` is written by the live upsert in `packages/server/src/domain/stats/write/apply-delta.ts` and by the rebuild in `packages/server/src/domain/stats/substrate/rebuild-rollups.ts`. No shown figure reads it: the model view maps generations, tokens, total generation time and cost, and reads average latency from canon. Stop writing the column and drop it in a numbered migration.

## Why

A column written with no reader costs every delta and rebuild, and invites a later reader to trust a measure the product never checks.

## Done when

No writer names the column, a migration drops it, and the model rows the dashboard shows are equal on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.

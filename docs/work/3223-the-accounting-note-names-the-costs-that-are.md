---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: stats
plan: stats-and-spend
---

# The accounting note names the costs that are left out

## What

`packages/client/src/features/stats/lib/analytics-copy.ts` says prompt extraction and captioning costs are omitted, while the spend ledger header in `packages/db/src/schema/stats.ts` says the ledger records exactly those calls. State in the copy what the totals include and what they leave out.

## Why

A reader trusts the note to tell whether the total is complete.

## Done when

The copy and the schema header agree on which calls the totals include.

## Evidence

Filled at landing: what ran and where its output is.

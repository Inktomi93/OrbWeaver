---
kind: tooling
status: doing
updated: 2026-11-14
priority: P3
area: tooling
lane: wt/agent-a014aeae27053cae3
plan: checked-law
---

# The cohort census misses a stray gap inside a stacked member

## What

Ruled: the census measures summed child heights on the stacking axis. The row cohort census in `tooling/src/ui-audit/ops/walker/census-cohort.ts` measures a member whose children stack by its content extent, so an open group is not reported; a member whose second stacked child carries a stray top margin is no longer reported either. Summing child heights keeps the open group excused and reports the stray gap.

## Why

The ruling traded one false finding for one blind spot, and nobody chose the blind spot.

## Done when

A fixture with a stray top margin inside a stacked member is reported, the open-group fixture stays excused, and the census runs clean on the product or each new finding is fixed at its site.

## Evidence

Filled at landing: what ran and where its output is.

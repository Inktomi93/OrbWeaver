---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# component-type-home reds on main: ordinary reporting waiver spelling and returned attribute API timeout

## What

On main, tests/tooling/floor/code-facts/component-type-home.test.ts fails two tests. 'ordinary reporting accepts only delivered component ownership' throws Invalid gate policy: descriptor.fix must mention its own waiver spelling for component-placement-fixture (main 27ec80e986; the 1041 type-homes-1 shard reports fixing it, recheck on 980b35b5b5). 'returned attribute API follows exact producer and final JSX spread' times out at the 5 s default.

## Why

A red test on main hides any new regression in component ownership, and a timeout gives no verdict at all.

## Done when

Both tests pass on main through pnpm test:scoped, with the timeout cause fixed or a measured, justified per-test budget, never a blanket raise.

## Evidence

Filled at landing: what ran and where its output is.

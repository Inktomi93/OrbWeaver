---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: tests
plan: test-foundation
---

# The corpus build mints a background asset id in completion order under stalled calls

## What

`tests/support/node/corpus-determinism.int.test.ts` publishes the corpus plain, under provider latency and with stalled calls, and compares the databases. In CI the stalled publish gave one background asset the next id in sequence, so the asset row, its kind row, a character's background override and a settings background library entry all differed by that one id. The rows, hashes and counts were otherwise equal. An id is minted when a concurrent step finishes, not in the order the corpus declares it.

## Why

The corpus is the fixture every surface and e2e run reads. A build that depends on call timing fails CI at random and can hide a real difference.

## Done when

Every corpus id is minted in declared order whatever the timing of the calls around it. The step that mints the background asset is found and fixed at its cause, not retried. The determinism test passes over repeated runs with the stall case, and a planted reorder of two concurrent mints turns it red.

## Evidence

Filled at landing: what ran and where its output is.

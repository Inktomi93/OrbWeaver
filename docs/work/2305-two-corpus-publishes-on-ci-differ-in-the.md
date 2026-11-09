---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: testing
lane: wt/agent-a740022b7918c0ed9
plan: test-foundation
---

# Two corpus publishes on CI differ in the database bytes

## What

tests/support/node/corpus-determinism.int.test.ts fails on CI with /db/orbweaver.db differing between two publishes from one tree. It failed on CI run 41761365170 at 7b9321e6cc and again on run 42608547761 at 32010ac06c, and passes locally at 1158a9808a. Some value in the published database does not come from the injected source: a clock, a random id, or page layout that depends on timing.

## Why

A corpus that is not byte-identical breaks fixture reuse and turns the CI node job red at random.

## Done when

The test names the differing tables and rows when it fails, the cause is fixed at its source so every value comes from the injected clock and id source, and the test passes on repeated CI runs.

## Evidence

Filled at landing: what ran and where its output is.

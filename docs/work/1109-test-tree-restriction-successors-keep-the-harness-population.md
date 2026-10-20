---
kind: tooling
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# Test tree restriction successors keep the harness population

## What

In the tests-1 shard of item 1041, no-direct-reports-write and test-mock-doctrine are scoped to ts and tsx under the test tree minus legacy, while the old gates covered the authored test root including the tests/support/node harness modules; the narrowing is unrecorded.

## Why

Item 1041 moves the gate only when the successor keeps every claim the old gate made or records a loss with a census proving no live site depends on it; the shard was refuted on this point after three attempts, and the old gate stays in force until it passes.

## Done when

The successor covers the harness modules with a planted defect red first, or the loss is recorded with a census showing no live site hits it; an independent verifier confirms; the old gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.

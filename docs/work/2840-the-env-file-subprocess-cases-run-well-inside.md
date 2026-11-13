---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: server
plan: test-foundation
---

# The env file subprocess cases run well inside their time budget

## What

The subprocess cases in `tests/server/foundation/env/env-file-load.int.test.ts` each boot a child and run close to the default case limit on a quiet box, so they time out under load.

## Why

A case that passes only on a quiet box reports load, not a defect.

## Done when

Those cases share a boot or prove their fact in process, and the file passes under load with no slow tag and no larger case budget.

## Evidence

Filled at landing: what ran and where its output is.

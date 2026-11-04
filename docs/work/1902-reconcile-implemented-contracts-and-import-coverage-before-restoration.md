---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Reconcile implemented contracts and import coverage before restoration

## What

Compare the automation result, preset output and multi-profile import obligations against their maintained assertions. Refresh relevant production changes before deciding equivalence. Inspect `tests/contracts/automation/results.contract.test.ts`, `tests/contracts/preset/views.contract.test.ts` and `tests/client/data/import-tree-plan.int.test.ts`.

## Why

Existing assertions can satisfy reference obligations despite moved files and changed contract shapes. Rebuilding them would duplicate coverage.

## Done when

Each selected obligation has a covered, partial, qualification-only or explicit drop decision with assertion references. Update the restoration register and reusable decision evidence. Run affected qualification only where needed; no new tests for already-covered outcomes.

## Evidence

Filled at landing: what ran and where its output is.

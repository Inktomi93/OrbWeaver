---
kind: bug
status: doing
updated: 2026-10-07
priority: P2
area: tooling
lane: codex/ci-dependency-upgrade
---

# Make Select entrance evidence deterministic in component tests

## What

Repair the component test that observes native Select entrance evidence. Retain first-entry, repeat-entry and application-work budget assertions and failure diagnostics.

## Why

The hosted component run can open the popup without satisfying the entrance evidence predicate. A successful retry hides the missing first-attempt evidence.

## Done when

A causal probe separates the failing path. Native component checks and bounded repeats pass without widening timeouts, inventing observer evidence or weakening budget assertions. Fresh hosted artifacts retain failed-attempt diagnostics.

## Evidence

Native entrance timing marks can complete without a long frame. The fixture creates real frame work during its first opacity transition; observer entries, classification assertions and application-work budgets remain native and unchanged.

The causal control separates absent observer evidence from checkpoint filtering. Full-file checks and bounded repeats pass. Failed predicates retain the motion snapshot and entrance marks before propagating the original failure. The original hosted attempt lacked a raw ring, so its exact cause remains unproven.

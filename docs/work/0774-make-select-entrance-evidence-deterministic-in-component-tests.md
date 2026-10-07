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

Filled at landing: what ran and where its output is.

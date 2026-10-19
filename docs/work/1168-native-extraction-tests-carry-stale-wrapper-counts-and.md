---
kind: bug
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Native extraction tests carry stale wrapper counts and default timeouts

## What

extractWithoutReferenceWrappers asserts pass.findReferences runs at least once, which stopped holding once computed answers are reused, so about 13 semantic-inventory-extract tests fail; the strict-refs malformed-answer test and the extract Git-admission and alias tests run 20 to 50 s on the 5 s default budget. Both fail on main as well as on the 1045 branch.

## Why

Reds that fail for the instrument's own reasons hide real extraction regressions.

## Done when

The helper counts native-kind answers instead of wrapper calls; each long native test carries a scaled timeout; semantic-inventory-extract and native-strict-references pass on a quiet run.

## Evidence

Filled at landing: what ran and where its output is.

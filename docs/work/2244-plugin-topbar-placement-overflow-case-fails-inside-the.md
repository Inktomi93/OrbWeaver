---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# plugin-topbar-placement overflow case fails inside the full CT run

## What

tests/client/features/plugin/components/plugin-topbar-placement.ct.tsx:131 (placed commands that do not fit overflow before any house control) failed once in a full CT run and passes alone on main and on a lane branch.

## Why

An intermittent red in the full run hides real regressions and makes the suite untrusted.

## Done when

The cause is named from the failure trace and fixed at the source, and the case passes repeated full-run-position runs.

## Evidence

Filled at landing: what ran and where its output is.

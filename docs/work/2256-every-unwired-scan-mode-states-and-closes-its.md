---
kind: tooling
status: open
updated: 2026-11-08
priority: P2
area: tooling
plan: unwired-code
---

# Every unwired scan mode states and closes its blind spots

## What

After the fields boundary fix, check each pnpm unwired mode (fields, params, unions, shapes, ports) for the same class of blind spot: a use the mode cannot see, a cross-world or cross-boundary read, a re-export or wrapper, a dynamic key, a string-addressed lookup. Each mode's output states what it cannot see, as the ui-facts report does.

## Why

One mode counting a wire send as dead was found by sampling; the other modes have never been audited the same way, so their clean rows are unproven.

## Done when

Each mode is cross-checked on main against an independent method with a positive control, every difference explained, its output prints a limits section, any new detection lands with that cross-check recorded in Evidence, and the regenerated tables are committed. Fixtures only where a few fast in-process cases pin a shape the real tree lacks.

## Evidence

Filled at landing: what ran and where its output is.

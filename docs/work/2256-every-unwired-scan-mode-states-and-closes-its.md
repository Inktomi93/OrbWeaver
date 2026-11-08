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

After the fields boundary fix, check each pnpm unwired mode (fields, params, unions, shapes, ports) for the same class of blind spot: a planted use the mode cannot see, a cross-world or cross-boundary read, a re-export or wrapper, a dynamic key, a string-addressed lookup. Each mode gets planted-case fixtures for its reads and its true dead cases, and its output states what it cannot see, as the ui-facts report does.

## Why

One mode counting a wire send as dead was found by sampling; the other modes have never been audited the same way, so their clean rows are unproven.

## Done when

Each mode has fixtures that plant every read shape it claims and a true dead case, a cross-check run against an independent method on main with the differences explained, and a printed limits section; any new detection lands with its fixture, and the regenerated tables are committed.

## Evidence

Filled at landing: what ran and where its output is.

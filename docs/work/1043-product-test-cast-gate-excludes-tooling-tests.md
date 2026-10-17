---
kind: tooling
status: open
updated: 2026-10-17
priority: P2
area: tooling
plan: test-foundation
---

# Product-test cast gate excludes tooling tests

## What

Apply D325 in `no-test-fabrication`: the value-cast judgement excludes `tests/tooling`; the double-cast fabrication judgement and `test-production-clone` keep their populations. Delete the baselined value-cast markers under `tests/tooling`. Repair the double casts in `tests/support` factories so each builder returns a real value.

## Why

Tooling tests follow the tooling rule, and casting a tool's own artifact is allowed there; the shared builders are product tests and must not fabricate.

## Done when

A tooling-test value cast is not a finding and a `tests/support` double cast still is, both with planted controls; the covered markers are gone; the repaired builders pass their consumers.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Refuse unseeded ids and silently vanishing case tables in tests

## What

ESLint rules over tests/\*\*: a one-argument mintTypeId(prefix) call (ambient uuidv7), and a test.for or test.each whose first argument is a .filter() call, pointing at ids.typeId and forEachNonEmpty. Also correct the lane skill's 'generate fixtures with mintTypeId' line so it names the seeded form Spine-Testing section 3 requires.

## Why

Unseeded ids break determinism, and a filtered case table can run zero cases and stay green.

## Done when

Both rules refuse a planted case and accept the derived form; existing sites are fixed; the lane skill names the seeded form; both report zero over tests/.

## Evidence

Filled at landing: what ran and where its output is.

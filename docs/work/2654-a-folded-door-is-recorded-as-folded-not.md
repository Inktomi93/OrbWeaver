---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: testing
plan: surface-walk
---

# A folded door is recorded as folded, not as not applicable

## What

In the Characters library walk the New and Import doors are recorded as not applicable when they fold into the overflow menu at the largest phone text (tests/e2e/support/surface-character.ts).

## Why

A coverage record that says a control does not apply when it only moved hides that nobody opened it.

## Done when

The walk opens a folded door through its overflow and records it witnessed, or records a skip with a listed reason, and no door that exists is recorded as not applicable.

## Evidence

Filled at landing: what ran and where its output is.

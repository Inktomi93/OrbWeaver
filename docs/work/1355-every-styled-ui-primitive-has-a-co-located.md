---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: ui
plan: test-foundation
---

# Every styled ui primitive has a co-located CT

## What

UI-Primitives-and-Reuse.md section 13.7 requires a co-located tests/ui CT for every styled primitive (icons exempt). About 45 of 65 primitive directories have none, including button, input, select, checkbox, switch, slider, combobox, autocomplete, badge, skeleton, scroll-area, table, toggle and toggle-group.

## Why

The R7 acceptance shapes (the 8 interaction states, keyboard operation, the a11y contract, Field association, re-render with a fresh collection) are untested for most primitives, and the clause cannot be enforced at zero until they exist.

## Done when

Each styled primitive has a CT that mounts it under CtIsolation and covers its R7 shapes, and tests/ui/primitive-trio.test.ts gains the co-located-CT clause at zero.

## Evidence

Filled at landing: what ran and where its output is.

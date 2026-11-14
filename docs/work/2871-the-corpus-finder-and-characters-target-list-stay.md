---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The corpus finder and characters target list stay inside their pane at 300% text

## What

On the corpus finder and the characters target at 300% text on a phone, a block inside the bounded library list is wider than the list and the pane scrolls sideways. The list is `packages/client/src/components/list-page.tsx`.

## Why

A finder that scrolls sideways hides the end of every result.

## Done when

A component test in `tests/client/features/discovery/components/` mounts the corpus finder and the characters target at 390px wide and 300% text. It asserts that the pane does not scroll sideways and names the widening block if it does. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.

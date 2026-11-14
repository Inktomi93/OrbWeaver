---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: ui
plan: cross-surface-consistency
---

# A wrapped row action cluster sits at the row's end, not at the start of its line

## What

In Connections rows and the Chats list at 200% text, the overflow menu button wraps under the row and lands at the start of its line. The actions slot in `packages/ui/src/primitives/list-row/variants.ts` is as wide as its content and has no end alignment of its own once the row wraps.

## Why

A person looks for row actions at the row's end edge, and one at the start of a line reads as detached from its row.

## Done when

A component test in `tests/ui/primitives/list-row/` mounts a ListRow whose actions cannot sit beside its body at 390px wide and 200% text. It asserts that the actions' right edge equals the row's right edge. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The About page's copy button subject wraps inside the column at 300% text

## What

On Settings, About, the Version and Updates rows at 300% text on a phone, the text inside a copy button's subject is wider than the column and the page scrolls sideways. The copy button is `packages/ui/src/primitives/copy-button/copy-button.tsx` with its recipe in `packages/ui/src/primitives/copy-button/variants.ts`.

## Why

A value the person is about to copy must be readable whole.

## Done when

A component test in `tests/client/features/config/surfaces/` mounts the About page at 390px wide and 300% text and asserts that the column's scroll width equals its client width and the subject text lies inside the column. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.

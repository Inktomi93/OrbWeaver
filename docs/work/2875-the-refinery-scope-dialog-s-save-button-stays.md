---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# The refinery scope dialog's Save button stays inside the dialog at 300% text

## What

In the refinery scope dialog on a phone at 300% text, the Save button paints past the dialog body. The dialog is `packages/client/src/features/refinery/components/scope-editor-dialog.tsx`.

## Why

A Save button cut at the edge cannot be pressed whole.

## Done when

A component test in `tests/client/features/refinery/components/` opens the scope dialog at 390px wide and 300% text and asserts that Save lies inside the dialog body. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.

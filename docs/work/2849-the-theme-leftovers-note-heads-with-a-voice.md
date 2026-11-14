---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The theme leftovers note heads with a voice no smaller than its explanation and holds the reading measure

## What

In the Looks import note, the heading is set in the label voice, which is smaller than the explanation under it. The show and hide button stretches across the whole row, because the collapsible root is a flex column and stretches its trigger. The raw key list runs in one long line. The note is `packages/client/src/features/config/components/theme-import-leftovers.tsx`.

## Why

A heading quieter than its own sentence, a full-width button for a small action and a line longer than the reading measure make the note harder to scan than the notes beside it.

## Done when

A component test in `tests/client/features/config/surfaces/` imports a theme that leaves keys behind and opens the note. It asserts that the heading's font size is at least the explanation's, that the toggle's width equals its content width, and that the key list's width does not exceed the prose measure. It fails on the current code and passes after. The fix uses the Text `cap` and voice props and the collapsible trigger's `self` axis, not a class at the call site.

## Evidence

Filled at landing: what ran and where its output is.

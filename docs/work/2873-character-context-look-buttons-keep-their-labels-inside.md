---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Character Context Look buttons keep their labels inside the pane

## What

In the character Context Look tab on a phone at 300% text, the Start from a theme button, the Reset all to Inherit button and the Add your own in Settings button paint past the pane's right edge. The tab is `packages/client/src/features/character/components/character-appearance-tab.tsx`.

## Why

A control cut at the edge cannot be read or pressed whole.

## Done when

A component test in `tests/client/features/character/components/` mounts the Look tab at 390px wide and 300% text. It asserts that each of these buttons lies inside the pane. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.

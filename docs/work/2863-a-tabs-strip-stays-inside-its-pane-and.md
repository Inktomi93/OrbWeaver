---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# A Tabs strip stays inside its pane and scrolls within its own box

## What

On Settings, Workloads at 200% and 300% text on a phone, the Tabs list is wider than the page and scrolls the whole settings column sideways. The list recipe in `packages/ui/src/primitives/tabs/variants.ts` is fit-content with tabs that never wrap and has no scroll box of its own. The same strip is a lead for the corpus selected-context buttons and the character Context Look buttons, whose clipping box is the tabs root.

## Why

A strip that widens its page hides the rest of the page and the tabs it cannot reach.

## Done when

A component test in `tests/ui/primitives/tabs/` mounts Tabs with more labels than fit a 390px pane at 300% text. It asserts that the pane's scroll width equals its client width, that the list scrolls inside its own box, and that the active tab can be scrolled into view. It is red before the change and green after. The Workloads page, the corpus selected-context tabs and the character Context tabs are then measured at the same size and the result is recorded.

## Evidence

Filled at landing: what ran and where its output is.

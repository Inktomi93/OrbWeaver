---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
---

# Unchecked checkboxes are nearly invisible on mid-grey custom themes

## What

On a mid-grey custom theme, an unchecked checkbox's border is nearly invisible.

## Why

Pre-existing; side-eye found it during the tone review. An unchecked control must show its boundary (WCAG 1.4.11).

## Done when

The unchecked checkbox border clears 3:1 against its host in each seed and on `oklch(0.6 0 0)`, pinned by a CT.

## Evidence

Cause: the unchecked edge came from `SELECTION_CONTROL`'s `border-input-border`, a fixed light-dark pair no ThemeScope re-solves. Over a carried `oklch(0.6 0 0)` background the painted edge measured 1.46:1 against the host (edge 105,101,97 on 128,128,128). The three seeds already cleared 3:1.

Fix: `packages/ui/src/primitives/checkbox/variants.ts` sets `border-muted-foreground` on the checkbox root, a ramp role the scope derives for its own background and that clears 4.5:1 on the background, card and popover hosts. The checked, indeterminate and invalid edges keep their own data-state utilities. Radio and switch share the frame but are not in this item.

Proof: `tests/ui/primitives/checkbox/platform-checkbox-contrast.suite.ct.tsx` samples the painted top-edge pixel row against the host pixel for each host (background, card, popover) under Hearth, Light, Mocha and a custom ThemeScope at `oklch(0.6 0 0)`. Red on the old skin for the custom scope on Chromium and WebKit (1.46:1); green on both after the fix.

---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# The phone bar's You tab shows no open state and the section tab stays lit under its sheet

## What

`RailButton` in `packages/client/src/features/app-shell/components/rail-button.tsx` paints only the current section. A modal trigger has no open state, so with the You sheet up the section tab keeps its active paint and the You tab shows nothing. Other shell triggers that open a sheet, modal or popover may lack an open state the same way.

## Why

On a phone the bar says the reader is on a section while the You sheet covers it. The owner reported it from his phone.

## Done when

While its sheet is open the You tab reads as open to sight and to assistive tech as a disclosure, never as the current page. The section tab keeps `aria-current` and drops its active paint until the sheet closes by any path. Every shell trigger of a sheet, modal or popover shows its open state through one shared mechanism. A component test beside `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx` pins it.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: decision
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-a0f363f919c3e186a
plan: cross-surface-consistency
---

# Decide whether the phone tab bar stays in the accessibility tree while the You sheet is open

## What

The You sheet is a trap-focus drawer, so while it is open Base UI hides the rest of the page, the tab bar included, from the accessibility tree. The bar stays painted and pressable for a finger (a tab press closes the sheet and navigates), and the You tab now states aria-expanded, but assistive tech cannot reach either while the sheet is up.

## Why

A sighted touch user can leave the sheet through any tab; a screen-reader user can only leave it through Close or Escape, and the You tab's expanded state is unreachable at the moment it is true.

## Done when

A recorded ruling: either the bar is exempted from the sheet's outside-hiding so its tabs and the You tab's state stay reachable, or the current behavior stands with the reason written where the sheet is composed.

## Evidence

Filled at landing: what ran and where its output is.

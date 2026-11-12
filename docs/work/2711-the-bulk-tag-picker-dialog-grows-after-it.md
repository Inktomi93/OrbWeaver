---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: cross-surface-consistency
---

# The bulk tag picker dialog grows after it opens

## What

The Characters bulk tag picker dialog gains height a moment after it reports ready, so its footer controls move with no animation running, on desktop and phone. The cause is not yet read in source. Measurements: the stability walk report under reports/cb-walk-stability.

## Why

A control that moves after the dialog settles takes a misplaced click.

## Done when

The dialog's footer controls hold their position from readiness on, shown by a component test on the production dialog that is red today, at desktop and phone sizes.

## Evidence

Filled at landing: what ran and where its output is.

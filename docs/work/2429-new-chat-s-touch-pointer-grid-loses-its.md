---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: client
plan: cross-surface-consistency
---

# New chat's touch-pointer grid loses its row at 844x390 at 100 percent in CI

## What

Name why the 844 by 390 cell at default text loses the list's row in CI. Read the failed run's trace, or reproduce on pinned cores. If the walk reads before the dialog settles, it waits for settled layout. If the row is lost in the dialog's layout, fix the dialog.

## Why

A layout read that depends on runner speed, or a real lost row, leaves CI red.

## Done when

the cause is stated with the trace or repro, the cell passes on CI, and no cell or budget is removed.

## Evidence

Filled at landing: what ran and where its output is.

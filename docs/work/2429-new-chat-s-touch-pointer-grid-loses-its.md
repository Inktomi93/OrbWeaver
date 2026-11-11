---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# New chat's touch-pointer grid loses its row at 844x390 at 100 percent in CI

## What

CI run 42926668922 failed tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx line 807 (New chat's reach over the size grid, touch pointer, holds with the temporary-room notice above the list) with one failing cell, 844x390 at 100%: row. The same case passes locally.

## Why

Either a layout read that depends on runner speed or a real edge where the list loses its whole row; both leave CI red.

## Done when

The cause is named with evidence from the CI trace or a pinned-core local repro, the cell holds its row on CI, and no budget or cell is dropped.

## Evidence

Filled at landing: what ran and where its output is.

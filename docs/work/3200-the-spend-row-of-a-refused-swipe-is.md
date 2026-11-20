---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# The spend row of a refused swipe is explained to the user

## What

When an import leaves an over-long swipe out, the spend row a bundle holds for that swipe stays on its message and nothing tells the user what it paid for.

## Why

Spend with no visible reply reads as a billing error.

## Done when

The import report names a kept spend row whose swipe was refused, or the row is left out with the swipe, with a case at the import door.

## Evidence

Filled at landing: what ran and where its output is.

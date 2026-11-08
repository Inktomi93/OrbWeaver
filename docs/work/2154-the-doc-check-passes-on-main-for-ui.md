---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: tooling
plan: cross-surface-consistency
---

# The doc check passes on main for UI-Density-Law and Spine-Testing

## What

tests/tooling/doc/ops/check.int.test.ts fails on clean main: docs/law/UI-Density-Law\.md breaks the size cap and holds banned words, and docs/law/Spine-Testing.md fails one check. The density law grew with the short-dialog and room-inset rulings. Fix the law text so the check passes, moving detail out under the size cap rather than raising it.

## Why

The doc check is the guard on law size and wording, and a red guard on main hides the next breach.

## Done when

check.int.test.ts passes on main, the density law states the same rulings within its size cap, and no banned word remains.

## Evidence

Filled at landing: what ran and where its output is.

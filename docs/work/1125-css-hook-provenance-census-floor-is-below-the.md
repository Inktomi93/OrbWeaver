---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# css-hook-provenance census floor is below the post-1041 gate corpus

## What

tests/tooling/verify/gates/css-hook-provenance-family.suite.test.ts asserts a fixed floor of more than 200 gate modules; main has fewer after the 1041 deletions and the 1115 cleanup, so the test is red with no defect behind it. Same pattern as the gate-spelling-twins floor fixed in 1116.

## Why

A stale floor turns a real shrink of the gate set into a red that claims a broken loader, and so hides a real loader failure.

## Done when

The floor derives from the live gate modules (as gate-spelling-twins now does), a planted empty loader still fails it, and the suite passes on main.

## Evidence

Filled at landing: what ran and where its output is.

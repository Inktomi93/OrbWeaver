---
kind: tooling
status: open
updated: 2026-10-25
priority: P2
area: tooling
---

# Whole-tree ESLint peaks under the 16 GB run bar

## What

pnpm lint:eslint packages tooling tests on main at 45b61020e2 passes but peaks at 17.0 GB RSS in 265 s. Measure per-rule cost with TIMING and peak RSS per config block, find the type-aware rules or program roots that grew, and cut the peak without a heap-limit raise.

## Why

The memory bar is one run's peak under 16 GB so checks run on modest hardware and a standard CI runner. The new UI-law, DOM-lock and test-authoring rules pushed the peak over it.

## Done when

A whole-tree run on main peaks under 16 GB with the same rule set and exit 0; the measurement and the cause are recorded on this item.

## Evidence

Filled at landing: what ran and where its output is.

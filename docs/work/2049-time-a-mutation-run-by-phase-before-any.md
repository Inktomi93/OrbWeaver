---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: testing
plan: test-foundation
---

# Time a mutation run by phase before any custom checker work

## What

Measure how much of a pnpm test:mutation run is checker time and how much is test time, on the admin guard file and one client file. A custom checker plugin on the 7.1 sync API with grouping by function body is only worth building if the checker is over half the wall time.

## Why

Other projects' native checker gains come from small programs, and ours was slower on the server world, so a build needs a measured reason.

## Done when

The split is recorded for both files, with a build or drop ruling for the checker plugin.

## Evidence

Filled at landing: what ran and where its output is.

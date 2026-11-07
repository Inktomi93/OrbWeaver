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

Measure how much of a pnpm test:mutation run is checker time and how much is test time, on the admin guard file and one client file. A probe of the 7.1 language server held one file open and pulled diagnostics after each full-text change: about 10 to 30 ms per check after a cold open under one second, about 450 MiB resident. That path, or the sync API snapshot overlay in tooling/src/unwired/native.ts, could replace the checker. Diagnostics cover the open file only, so compare its verdicts with the classic checker, including a mutant that breaks a caller in another file. Grouping is not needed at this speed.

## Why

Other projects' native checker gains come from small programs, and ours was slower on the server world, so a build needs a measured reason.

## Done when

The split is recorded for both files, with a build or drop ruling for the checker plugin.

## Evidence

Filled at landing: what ran and where its output is.

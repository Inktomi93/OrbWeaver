---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: testing
---

# The corpus e2e launcher says when its time budget ended the run

## What

When the corpus e2e launcher's execution budget expires (scripts/corpus-fixture.ts) it stops the native run and exits non-zero with no line naming the budget, the elapsed time or how many cases had not run. A whole-matrix run started through the single-cell command ended that way with no failed case.

## Why

A run that dies at its deadline with no reason reads as a crash and costs an investigation each time.

## Done when

A budget expiry prints the budget, the elapsed time and the unfinished project, a test plants a short budget and reads that line, and the exit code stays non-zero.

## Evidence

Filled at landing: what ran and where its output is.

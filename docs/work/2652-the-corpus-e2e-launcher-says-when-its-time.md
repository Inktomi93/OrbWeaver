---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: testing
---

# The corpus e2e launcher says when its time budget ended the run

## What

When the corpus e2e launcher's execution budget expires (scripts/corpus-fixture.ts) it stops the native run and exits non-zero with no line naming the budget, the elapsed time or how many cases had not run. A whole-matrix run started through the single-cell command ended that way with no failed case. Folded in, "A corpus e2e run that hits its cell budget says so": scripts/corpus-fixture.ts stops an e2e cell at its time budget and exits 2 with no line naming the budget, so a run of corpus-shell plus corpus-home-launch under load ends mid-suite with no Playwright summary and no failed case, which reads like a crash. After a budget stop, a run-marker sweep that fails reading a marked child's /proc environ (EACCES, the mid-exit case of 1959) leaves the runner waiting forever with no children after it prints that consumer completion is unconfirmed. Its done line was: A cell stopped by its budget prints the budget, the elapsed time and the specs it was running before it exits, and the runner exits after a budget stop even when the sweep fails, with a test that plants a short budget and a test that plants a failing sweep.

## Why

A run that dies at its deadline with no reason reads as a crash and costs an investigation each time.

## Done when

A budget expiry prints the budget, the elapsed time and the unfinished project, a test plants a short budget and reads that line, and the exit code stays non-zero.

## Evidence

Filled at landing: what ran and where its output is.

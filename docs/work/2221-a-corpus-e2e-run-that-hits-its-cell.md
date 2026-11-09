---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: tooling
plan: test-foundation
---

# A corpus e2e run that hits its cell budget says so

## What

scripts/corpus-fixture.ts stops an e2e cell at its time budget and exits 2 with no line naming the budget, so a run of corpus-shell plus corpus-home-launch under load ends mid-suite with no Playwright summary and no failed case, which reads like a crash. After a budget stop, a run-marker sweep that fails reading a marked child's /proc environ (EACCES, the mid-exit case of 1959) leaves the runner waiting forever with no children after it prints that consumer completion is unconfirmed.

## Why

A silent budget stop sends the next reader hunting for a product failure that does not exist.

## Done when

A cell stopped by its budget prints the budget, the elapsed time and the specs it was running before it exits, and the runner exits after a budget stop even when the sweep fails, with a test that plants a short budget and a test that plants a failing sweep.

## Evidence

Filled at landing: what ran and where its output is.

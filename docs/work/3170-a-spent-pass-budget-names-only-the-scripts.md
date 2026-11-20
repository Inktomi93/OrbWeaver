---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# A spent pass budget names only the scripts that would have run on that leg

## What

`reportBudgetSpent` (`packages/server/src/primitives/regex/index.ts`) names every remaining script, including ones whose placement or depth would have skipped them on that leg.

## Why

The log, and the later room notice, would name scripts that were never going to run.

## Done when

Only scripts the executor would have run are named, with a case that mixes legs past a spent budget.

## Evidence

Filled at landing: what ran and where its output is.

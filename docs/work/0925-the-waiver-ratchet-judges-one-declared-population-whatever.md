---
kind: tooling
status: doing
updated: 2026-10-11
priority: P1
area: verify
lane: wt/agent-acfe1992a696352b3
plan: test-mirror
---

# The waiver ratchet judges one declared population whatever the run selection

## What

lib/waiver-ratchet.ts judges a whole-repository structure --check run, which includes the tooling suites, against budget rows measured at application scope, and an --application --check selection appears not to judge the budget at all. So the same tree alarms or passes depending on how it was invoked: a whole-repository run on main alarms on no-test-fabrication 433 against 358, test-determinism 112 against 80, caught-failure-ownership 705 against 682, test-mock-doctrine 4 against 0, brand-in-name-position 58 against 56, tooling-argv-front-door 3 against 1, tooling-child-process-door 9 against 8, tooling-clock-budget 6 against 1 and tooling-project-home 6 against 5, while ct-no-oneshot-live-read-assert reads 353 against a row of 359. Reported by the item 900 lane.

## Why

gate-runtime-standardization section 5 makes the budget the count of a complete run; a budget whose verdict depends on the selection guards nothing, and the rows that disagree hide either new excuses or stale allowances.

## Done when

The ratchet judges each policy over one declared population (or the budget is keyed by scope), every selection that judges a policy gives the same verdict, each disagreeing row above is reconciled by fixing findings or lowering the row, and a test proves a rise is caught at every scope.

## Evidence

Filled at landing: what ran and where its output is.

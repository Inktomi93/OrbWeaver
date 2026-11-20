---
kind: tooling
status: open
updated: 2026-11-20
priority: P2
area: tooling
plan: test-enforcement
---

# The mutation runner reaches a verdict on a large module with time-budget tests

## What

pnpm test:mutation on packages/kit/src/content/index.ts gives no verdict: under Stryker instrumentation two linear-time budget cases in tests/kit/content take several times their budget and fail the dry run, and with a clean dry run the differential test covers nearly every one of thousands of mutants at seconds per case, so one runner needs about a day. The runner takes only whole files.

## Why

The repo mutation tool cannot judge the module whose tests most need it, so lanes fall back to hand-rolled reverts.

## Done when

Owner ruling: mutation testing has no time limit. A mutation run over that module reaches a verdict: it runs in the background with no wall-clock cap from the tool or the shell, time-budget test cases are excluded from mutation runs by a stated rule because they measure speed rather than behaviour, the run can name its test set and narrow to changed functions, and the runner uses the cores the box can spare.

## Evidence

Filled at landing: what ran and where its output is.

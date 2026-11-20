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

A mutation run over that module reaches a verdict on a standard runner: time-budget cases are skipped or scaled under instrumentation by a stated rule, the run can name its test set and narrow to changed functions, and the verdict lands within the tool own time cap.

## Evidence

Filled at landing: what ran and where its output is.

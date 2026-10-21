---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: server
plan: test-foundation
---

# Qualify retained-cohort continuation after the hosted timeout

## What

Hosted run 39620796838 times out the maintained retained-cohort variant at tests/server/domain/stats/persistence/retained-cohort.suite.int.test.ts:319. The timeout supplies no behavioral verdict or diagnosed cause. Evidence: reports/review/ci-1215-current/run-39620796838/triage.md.

## Why

The maintained failure prevents node qualification; its cause is separate from tooling inventory failures.

## Done when

Reproduce the exact maintained case with its native selection, identify the fixture or production cause, and qualify the retained-generation continuation. Preserve assertions and establish contention before changing a timing budget.

## Evidence

Filled at landing: what ran and where its output is.

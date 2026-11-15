---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tests
plan: test-enforcement
---

# The ESLint rule test helpers assert the rule id and line of each finding

## What

Several rule tests under `tests/tooling` assert only how many findings a planted source draws, through a helper that drops the rule id and the line. A finding from another rule, or on the wrong statement, keeps the count and passes. `tests/tooling/eslint-test-expected.test.ts` shows the stronger shape: its helper returns the rule id and line of each finding and each case states them.

## Why

A count is the claim only when the findings are the right ones. A rule that reports the wrong node still passes a count, so its message and fix location can regress unseen.

## Done when

Each shared findings helper in the tooling rule tests returns the rule id and line, and each case that asserts a count states the expected rule id and line instead. A planted wrong report line fails the case.

## Evidence

Filled at landing: what ran and where its output is.

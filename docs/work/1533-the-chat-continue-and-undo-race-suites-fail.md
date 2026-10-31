---
kind: bug
status: open
updated: 2026-10-31
priority: P1
area: chat
plan: test-foundation
---

# The chat continue and undo race suites fail on main

## What

tests/server/domain/chat continue-revert-row-races, continue-revert-snapshot-races and continue-undo-snapshot-races (.suite.int.test.ts) fail on main, three of twenty tests, a different set each run. Decide whether each failure is a product race or a test that depends on timing, fix the cause, and inject the clock and ids so the order is fixed.

## Why

A red suite on main hides real regressions in the continue and undo paths, which guard against data loss.

## Done when

Each suite passes ten runs in a row on main at load under 24 and at high load; a product race, if found, has a case that fails before the fix.

## Evidence

Filled at landing: what ran and where its output is.

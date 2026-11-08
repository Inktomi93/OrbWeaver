---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Fix the stale budgets citation in load-budget

## What

tooling/src/floor/host/load-budget.ts cites a line in snap/lib/budgets.ts that moved.

## Why

A wrong citation sends a reader to the wrong rule.

## Done when

The comment cites the symbol, not a line number.

## Evidence

Filled at landing: what ran and where its output is.

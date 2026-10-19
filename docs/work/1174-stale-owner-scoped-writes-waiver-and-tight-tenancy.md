---
kind: bug
status: open
updated: 2026-10-19
priority: P3
area: security
---

# Stale owner-scoped-writes waiver and tight tenancy budget on main

## What

workloads/persistence/queries.ts:250 carries an owner-scoped-writes waiver whose budget row says 29 against 28 findings, and the tenancy-scope-family suite's 14 s budget fails under load.

## Why

A stale waiver row hides a budget drift, and a budget that fails under load hides real tenancy reds.

## Done when

The stale waiver is re-judged at its subject and removed or justified, the budget row matches, and the tenancy-scope-family budget is measured and scaled.

## Evidence

Filled at landing: what ran and where its output is.

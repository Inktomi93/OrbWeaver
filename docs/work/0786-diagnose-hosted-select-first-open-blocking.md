---
kind: bug
status: open
updated: 2026-10-07
priority: P1
area: testing
---

# Diagnose hosted Select first-open blocking

## What

Attribute the native first-open blocking failure and repair a demonstrated cause without widening performance budgets.

## Why

A retry can conceal first-open work that exceeds the required blocking budget.

## Done when

Native evidence distinguishes fixture contention from application work; any repair preserves cold first-open semantics and the existing budgets.

## Evidence

Native quiet and configured-worker checks pass. The hosted first-open blocking expansion is not reproduced. Existing budgets remain unchanged. A failing hosted CPU trace is required before a source repair is justified.

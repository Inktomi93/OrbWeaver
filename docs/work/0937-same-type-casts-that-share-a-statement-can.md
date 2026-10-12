---
kind: tooling
status: doing
updated: 2026-10-12
priority: P1
area: tests
lane: wt/agent-adcddc796d726efaf
plan: test-mirror
---

# Same-type casts that share a statement can be fixed or waived one by one

## What

Item 899 widened no-test-fabrication to non-literal casts. Some findings share a statement or array with another cast to the same type, so one @orb-waive marker matches both and the engine refuses it as over-broad; they stay red. Fix each cast through a real builder or a typed factory (the 906 rule), or give the marker grammar a per-occurrence position so each finding can be waived on its own.

## Why

An unwaivable finding keeps the gate red without a fix path, which tempts a weaker gate.

## Done when

No no-test-fabrication finding is unwaivable; each of the 48 is fixed or carries its own marker, and the budget row matches.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: test-foundation
---

# The throttle budget test catches a single-axis swap

## What

In tests/tooling/snap/lib/throttle.test.ts, choosing the stage side on nav only, or the throttled side on ready only, stays green.

## Why

A swap on one axis would ship an unscaled ceiling unseen.

## Done when

One more unequal case per axis makes each single-axis swap fail.

## Evidence

Filled at landing: what ran and where its output is.

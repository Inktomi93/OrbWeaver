---
kind: tooling
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# cache-check's door drops its test-only re-exports

## What

tooling/src/cache-check/index.ts re-exports judgedReplies, plannedReplies and a dead TurnStep only for a test; production imports them from contract/plan.ts.

## Why

A door widened for a test hides what production really uses.

## Done when

The test reaches the symbols through an existing door or reach row, and the re-exports go.

## Evidence

Filled at landing: what ran and where its output is.

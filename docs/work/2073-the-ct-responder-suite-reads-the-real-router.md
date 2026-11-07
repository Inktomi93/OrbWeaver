---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: tooling
plan: test-foundation
---

# The ct-responder suite reads the real router record within its budget

## What

The row that loads the real tests/support/node/route-trpc.ts ran past its time budget, so it now uses a planted record.

## Why

A planted record cannot catch drift in the real one.

## Done when

One row reads the real record inside the default budget.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: server
lane: wt/agent-a9c11f23be40e8385
plan: import-robustness
---

# An unreadable stored workload result is logged and keeps its params

## What

`packages/server/src/domain/workloads/persistence/queries.ts` reads a result that no longer parses as an unreadable row without logging it, and blanks the row's valid params with it. The runner stores a result without validating it, so this read is the only check.

## Why

A malformed result written by the current build would go unseen by the operator.

## Done when

An unreadable result is logged once with the row id, the row keeps its valid params, and the runner validates a result before it stores it, each with a test.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: workloads
plan: unwired-code
---

# Delete the WORKLOAD_RESUME_POLICIES none member or wire its contribution

## What

No workload contribution sets the none resume policy (packages/contracts/src/workloads/execution.ts).

## Why

A union member nothing builds reads as a supported policy.

## Done when

The member is gone or a contribution that needs it sets it, unions reports no row for it, and the execution tests pass.

## Evidence

Filled at landing: what ran and where its output is.

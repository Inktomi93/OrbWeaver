---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Boot re-queues a cancelling workload row, undoing a cancel raised just before a crash

## What

Make boot reclaim finish a workload row that was cancelling instead of re-queueing it.

## Why

requeueInFlight in packages/server/src/domain/workloads/persistence/queries.ts moves both running and cancelling rows back to queued. A cancel raised just before a crash is undone and the job runs again.

## Done when

A test marks a row cancelling, runs the boot reclaim, and sees the row end cancelled and not queued. A running row is still re-queued.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: database
lane: wt/db-background-cancellation
---

# Honor cancellation before background asset and segment work

## What

Stop avatar-backfill gathering and new owner work after cancellation. Stop starting new segment SQL batches after embedding returns an aborted signal. Real-function recording-boundary probes reproduce both cases.

## Why

Cancelled workloads continue starting independent filesystem and database work, retaining background resources unnecessarily.

## Done when

Thread the signal to actual gather and write boundaries. Test pre-abort, abort during gathering, abort after embedding, and abort after a completed segment batch. Allow existing atomic operations to settle. Preserve vector-generation guards, coherent committed rows, resumable skips and truthful workload outcomes. Measure retained avatar input bytes before selecting a batching change.

## Evidence

Filled at landing: what ran and where its output is.

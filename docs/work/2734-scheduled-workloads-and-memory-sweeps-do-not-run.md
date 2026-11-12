---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# Scheduled workloads and memory sweeps do not run for a disabled account

## What

`packages/server/src/domain/workloads/engine/schedule-tick.ts` and `packages/server/src/domain/workloads/persistence/schedule-queries.ts` enqueue and run a schedule for a disabled owner. The memory backfill and summarize sweeps in the chat domain have no enabled check either. The spend is on the disabled account's own connections.

## Why

An admin who disables an account expects its background work to stop with it.

## Done when

Each path skips a disabled owner and resumes when the owner is enabled again, with a test per path.

## Evidence

Filled at landing: what ran and where its output is.

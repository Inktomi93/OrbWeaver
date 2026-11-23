---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A value our logger or debug probe serializes counts as sent

## What

The unwired graph misses a value handed to the MemoryLog or observability sink, and a value returned as unknown into a debug probe reply, because the value widens to unknown. Fields such as UnreadableStoredJsonView\.storedText and the MemoryBuildTrace counters then sort write-only and dead, though an operator reads them.

## Why

An operator-facing field sorted dead is a false delete proposal.

## Done when

Planted log-entry and probe-view cases sort sent-only (ask), and each fails without the change.

## Evidence

Filled at landing: what ran and where its output is.

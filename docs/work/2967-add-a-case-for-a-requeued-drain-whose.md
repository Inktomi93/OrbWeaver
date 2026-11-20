---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: test-foundation
---

# Add a case for a requeued drain whose first request faults

## What

A drained turn whose first provider request faults is requeued and keeps its own send's dice note. A lane probe showed this, but no committed case holds it.

## Why

A change to the requeue path could hand a retried turn another send's note without a red.

## Done when

A composed-root case faults the first drained request, drains again, and asserts each reply carries its own send's note.

## Evidence

Filled at landing: what ran and where its output is.

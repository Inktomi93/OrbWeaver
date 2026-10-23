---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Wire-capture spill chain is shared across composed graphs

## What

`packages/server/src/foundation/observability/debug/wire-capture.ts` queues spill writes on one module-level `spillChain`, so `settleWireCaptureSpill()` on one graph waits for every graph's pending appends in the process.

## Why

Shared mutable state across graphs is the class of singleton the no-isolate test runner just paid to remove.

## Done when

Each composed graph owns its spill queue, and disposing one graph waits only on its own writes.

## Evidence

Filled at landing: what ran and where its output is.

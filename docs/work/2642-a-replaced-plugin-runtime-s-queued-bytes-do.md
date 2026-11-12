---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: plugins
lane: wt/agent-a84eabc3e8d8f0a49
---

# A replaced plugin runtime's queued bytes do not count against the live runtimes' shares

## What

Each plugin runtime has its own share of every IPC queue. While a runtime is being replaced, its still-queued bytes can briefly count against the queue's total, so the room the live runtimes can use is smaller than their shares for that moment. No bystander refusal was observed.

## Why

The share ruling says no runtime's frames take another's room; replacement is a moment where the accounting can lend room away.

## Done when

Queued bytes of a runtime that is being replaced are released or accounted to that runtime alone until they drain, with a test that replaces a runtime mid-flood and shows a bystander's full share is served.

## Evidence

Filled at landing: what ran and where its output is.

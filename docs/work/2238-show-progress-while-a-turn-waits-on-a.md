---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# Show progress while a turn waits on a cold-starting provider

## What

While a turn waits for its first token past a short delay, the pending row says it is waiting for the provider to start. The idle window stays as it is; no shorter first-byte bound is added. The state comes from a structured turn event, never from parsed text.

## Why

Owner ruling. A large local model can take minutes to load, and a silent pending row reads as a hang. A shorter bound would end real cold starts.

## Done when

A component test on the production room holds the first token past the delay and shows the waiting line, then shows it replaced when the first token arrives. A server case shows a slow first token inside the idle window is not ended early.

## Evidence

Filled at landing: what ran and where its output is.

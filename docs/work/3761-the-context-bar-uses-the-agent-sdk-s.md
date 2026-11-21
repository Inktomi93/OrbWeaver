---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
---

# The context bar uses the agent SDK's real context fill

## What

The context bar (packages/client/src/features/chat/lib/context-room.ts) runs on the app's token estimate. On a Claude subscription turn the agent SDK reports the real fill through probeContextUsage (packages/inference/src/backends/agent-sdk/runner.ts), and it only reaches a log line.

## Why

The bar shows an estimate where the provider states the real number.

## Done when

A Claude subscription turn carries the reported context fill to the client, the bar shows it and says it is reported, other backends keep the estimate, and a test drives a reported fill.

## Evidence

Filled at landing: what ran and where its output is.

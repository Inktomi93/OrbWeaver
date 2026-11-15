---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: connection
plan: cross-surface-consistency
---

# An embed batch respects the per-model input count a hosted list states

## What

NanoGPT's embedding list states a per-model limit on inputs per request. The embed batcher does not read it, so an embedder with a low limit can be sent a batch the service refuses.

## Why

A refused batch fails the whole embedding job for a user who picked a listed model and changed nothing.

## Done when

A case embeds more inputs than a listed model's stated count through the composed root against a scripted service that refuses an over-size batch, and every input is embedded in batches at or under the limit.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: decision
status: open
updated: 2026-11-08
priority: P3
area: chat
---

# Show progress while a turn waits on a cold-starting provider

## What

When the provider cold-starts its model, as llama-swap does after its TTL, a turn shows only its pending ghost for up to three idle windows of 180 s plus backoff before it aborts with a retryable error.

## Why

The reader cannot tell a slow cold boot from a dead turn and has nothing to act on but Stop.

## Done when

A ruling decides whether the turn surfaces a waiting-on-provider state or a shorter first-byte bound, and the chosen behaviour has a case through the turn engine.

## Evidence

Filled at landing: what ran and where its output is.

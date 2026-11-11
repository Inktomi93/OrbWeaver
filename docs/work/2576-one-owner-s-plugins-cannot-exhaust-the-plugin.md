---
kind: bug
status: open
updated: 2026-11-11
priority: P1
area: plugins
---

# One owner's plugins cannot exhaust the plugin broker's IPC write queue

## What

The plugin broker abandons and exits when its IPC write queue to the parent passes its byte cap. Several storage-only plugins of one owner, each floating many large storage.set calls at once, fill that queue, the broker exits, and every owner's plugins go down. Found and reproduced by the security lane; the probe is in its lane report under reports/lanes. Whether main behaves the same is being checked in review.

## Why

One owner, with only the storage capability, takes every other owner's plugins down. It is the same harm as a hung worker killing the shared broker, by a different route.

## Done when

A bridge call that would overflow the write queue is refused to the calling plugin with a coded, retryable refusal and the broker keeps running. A test runs the reproducing load through the production broker and shows the broker alive, the caller refused, and another owner's plugin answering. The per-plugin share of the queue has a stated bound in the ledger.

## Evidence

Filled at landing: what ran and where its output is.

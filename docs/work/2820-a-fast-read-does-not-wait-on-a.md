---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# A fast read does not wait on a slow read in the same request batch

## What

The client sends every query through one batching link in `packages/client/src/data/trpc.ts`, and the server answers a batch only when every call in it has settled. A fast read that shares a batch with a slow one waits for it, on every surface.

## Why

A surface that gates on a small read can be held by an unrelated large one.

## Done when

The surfaces where a gating read can share a batch with a slow one are listed, and each either skips batching through the typed context flag or is shown not to gate on it.

## Evidence

Filled at landing: what ran and where its output is.

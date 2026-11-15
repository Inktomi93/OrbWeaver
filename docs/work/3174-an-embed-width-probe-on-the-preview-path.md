---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: embeddings
---

# An embed width probe on the preview path takes the caller's signal

## What

probeWidth (`packages/server/src/domain/embeddings/persistence/generation.ts`) runs under its own deadline only, and previewTargetMove reaches it through prove in packages/server/src/domain/embeddings/verbs/sync-target-generations.ts although that path now carries the request signal.

## Why

A cancelled connection-change preview keeps its encoder probe running until the deadline.

## Done when

probeWidth takes the caller's signal beside its deadline, and the preview path threads the request signal while the binding queue path keeps its own.

## Evidence

Filled at landing: what ran and where its output is.

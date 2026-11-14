---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# The stats rebuild's embedding-spend and generation-observation scans hold the event loop

## What

In `packages/server/src/domain/stats/persistence/rebuild-from-canon.ts`, `scanEmbeddingSpend` pages by `CHUNK` with no yield between pages, and `scanGenerationObservations` loads every row in one read. The message and variant scans already yield between pages.

## Why

On a heavy library each of these scans holds the loop for its whole read during every post-import rebuild, and every request on the server waits.

## Done when

A measured rebuild on a heavy library shows no single loop hold near the stage probe's base from either scan, and live stats still equal a rebuild.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: embeddings
---

# An embedder change keeps the paid summary text

## What

A new embedding generation deletes the old generation's digest rows with their summary text (`packages/server/src/domain/embeddings/persistence/queries.ts`). Keep the summary text and rebuild only the vector.

## Why

The summary text cost model calls to produce and does not depend on the embedder.

## Done when

A test changes the embedder and finds every digest's text intact and its vector rebuilt.

## Evidence

Filled at landing: what ran and where its output is.

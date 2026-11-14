---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: server
plan: stored-data-integrity
---

# A document whose stored file was purged is not counted as needing a re-read

## What

The databank banner counts a document as read by an older extractor when it has a source file id and a stale stamp (`countStaleExtractionDocuments` in `packages/server/src/domain/databank/persistence/queries.ts`). The re-read sweep in `packages/server/src/domain/databank/ingest/index.ts` skips a document whose stored bytes are gone. A document whose file was purged while its source id stayed set would be counted and never cleared. A code review raised it from reading the two paths; it is not reproduced, and it is older than the per-format stamp.

## Why

The banner would ask the owner to re-read documents that no sweep can change, and the count would never reach zero.

## Done when

A case purges a stale document's stored file, runs the sweep, and shows the banner count at zero, or shows that a purge always clears the source id so the state cannot exist.

## Evidence

Filled at landing: what ran and where its output is.

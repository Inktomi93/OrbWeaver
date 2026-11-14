---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
---

# Corpus and Discovery gating reads are surveyed against the search read that dials the embedder

## What

search.search (corpus-search-results.tsx line 113) dials the embedder for a semantic query and is the single suspending read of the results region. The Corpus surfaces beside it (corpus-moment-surface.tsx line 75 and corpus-artifact-context.tsx line 151, both chat.getMessageWindow suspense reads, and the finder's facet and list reads) were not part of the room, chat list, Home and Config survey. For each, read what mounts in the same tick as a search read and either tag the read that gates the paint through the typed helper in packages/client/src/data/trpc.ts or record that it mounts after the results settle.

## Why

The same batching hazard as the room: a fast read that gates a Corpus paint waits behind an embedder that is slow or down.

## Done when

Each Corpus gating read is listed as tagged through the typed helper with a dom test, or shown to mount after the search results settle, with the reason.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A repeated import cannot double a strike, proven at the import

## What

With the span index `chat_memory_strikes_span_unique` removed, every case in `tests/server/domain/chat/memory/memory-strikes-restore.int.test.ts` still passes, because the view shows one entry for a span. Only `tests/db/schema/chat-memory-strikes.repo.int.test.ts` guards the index.

## Why

A doubled strike row needs two restores to lift, and the host sees one entry.

## Done when

The same-library restore case reads the strike rows through a production read, or the repository case asserts the import's conflict path, and the case fails with the span index removed.

## Evidence

Filled at landing: what ran and where its output is.

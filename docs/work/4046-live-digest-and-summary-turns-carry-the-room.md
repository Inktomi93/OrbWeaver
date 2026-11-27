---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: inference
---

# Live digest and summary turns carry the room's names so they can use a slop list

## What

A side-generation turn with no speaker names sends no slop list, so a connection's antislop slop list does nothing on digests, summaries, extraction and captions; the digest layer holds no cast, and backfill batches mix chats under one request option.

## Why

Those turns lose the slop list's effect on an antislop connection, though they never push a name down.

## Done when

A live digest or summary turn for one room passes that room's character and user names, with name parts, so it sends the slop list with them allowed; a backfill batch splits per chat or keeps sending none, with the reason recorded; a test covers a live digest turn.

## Evidence

Filled at landing: what ran and where its output is.

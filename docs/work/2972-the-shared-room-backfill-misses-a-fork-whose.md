---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The shared-room backfill misses a fork whose shared parent was deleted before the migration

## What

`chats.parent_chat_id` is `ON DELETE SET NULL` (`packages/db/src/schema/chat.ts`), so such a fork has no ancestor to walk. Its own seats hold only the forker, and it stays unflagged while it keeps the parent's injections and room text. Ruling: accepted for the one existing install, no follow-up migration.

## Why

It is one-time and limited to the owner's install, but it is the one current path where another account's room text can meet a staged plane. The pin check covers only a pinned persona.

## Done when

The owner accepts the gap in writing, or a follow-up migration flags rooms with a non-null `forked_at` and a null `parent_chat_id`.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: rpg
---

# Deleting a message that anchors RPG rows surfaces a raw foreign-key error

## What

During review, chat.deleteMessages on an assistant message that anchors rpg snapshot or journal rows surfaced as a raw TRPCError SQLITE_CONSTRAINT (FOREIGN KEY constraint failed, a trigger) instead of a typed refusal. Not yet investigated.

## Why

A raw database error reaching the client is neither a typed refusal the UI can explain nor a guaranteed safe outcome.

## Done when

The delete either succeeds with the anchored rows handled by rule, or refuses with a typed domain error the client explains, pinned by a server integration test through the composed root.

## Evidence

Filled at landing: what ran and where its output is.

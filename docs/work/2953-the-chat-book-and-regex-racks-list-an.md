---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The chat book and regex racks list an attachment the room no longer applies

## What

The world-info pool and the regex resolver apply a chat attachment only when the room's host owns it (D64), and a handoff now detaches the rest. A room handed off before that detach existed can still hold a former host's row. `packages/server/src/domain/world-info/verbs/attachments/list-for-chat.ts` and `packages/server/src/domain/regex/verbs/attachments/list-for-chat.ts` list every junction row, so the rack shows that row as feeding the room while it applies nothing. The host can detach it. The rejected option was to filter both racks by the host's ownership: their member gate returns no host id, so it needs a new injected op on both domains for rows only an older handoff can leave.

## Why

The rack tells members which books and scripts shape their turns, and a row that applies nothing makes that statement false.

## Done when

A chat attachment the host does not own is either absent from both racks or shown as not applied, with a server case that plants such a row and reads both racks, and a control where the host's own attachment shows as applied.

## Evidence

Filled at landing: what ran and where its output is.

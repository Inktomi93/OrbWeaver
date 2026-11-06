---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: chat
---

# A deleted chat stays the active room when the room is not mounted

## What

Return Chats to its landing when the active chat is deleted while the room is not mounted.

## Why

chatDeleted reaches chatDeletedFromList in packages/client/src/state/active-chat-store.ts only through a mounted room or a Chats list row. A delete from another tab, a host delete of a shared room or the expiry sweep leaves a stale stored handle, so Chats reopens on a dead id and should stall on the load error with stream.attach retries. This comes from reading the code and has not been run.

## Done when

A component test deletes the active chat remotely while the shell is on Home and finds Chats back at its landing. The fix lives in active-chat-store.ts or in a user-channel consumer of chatDeleted.

## Evidence

Filled at landing: what ran and where its output is.

The product half of 1812. What: `chatDeleted` reaches `chatDeletedFromList` (`packages/client/src/state/active-chat-store.ts:263`) only through a mounted room (`chat-content.tsx:85`) or a Chats list row; `setActiveSection` in `shell-store.ts:207` never touches the room. Why: a delete from another tab, a host delete of a shared room, or the TTL sweep leaves a stale persisted `handle`, so Chats reopens on a dead id, expected stuck "Couldn't load this conversation" with `stream.attach` retries. From reading, not run. Done: a remote delete while on Home returns Chats to landing, proven by a CT. Fix home: `active-chat-store.ts` or a user-channel consumer of `chatDeleted`.

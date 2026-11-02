---
kind: bug
status: open
updated: 2026-11-01
priority: P3
area: chat
---

# A deleted chat stays the active room when the room is not mounted

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

The product half of 1812. What: `chatDeleted` reaches `chatDeletedFromList` (`packages/client/src/state/active-chat-store.ts:263`) only through a mounted room (`chat-content.tsx:85`) or a Chats list row; `setActiveSection` in `shell-store.ts:207` never touches the room. Why: a delete from another tab, a host delete of a shared room, or the TTL sweep leaves a stale persisted `handle`, so Chats reopens on a dead id, expected stuck "Couldn't load this conversation" with `stream.attach` retries. From reading, not run. Done: a remote delete while on Home returns Chats to landing, proven by a CT. Fix home: `active-chat-store.ts` or a user-channel consumer of `chatDeleted`.

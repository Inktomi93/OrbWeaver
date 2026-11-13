---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: chat
---

# A deleted chat stays the active room when the room is not mounted

## What

A room deleted or reaped elsewhere leaves this client pointing at it: the persisted active chat in `packages/client/src/state/active-chat-store.ts` keeps the stale id. The user channel carries no deleted event (`chatsChanged` in `packages/contracts/src/user-bus/index.ts` also fires for create, fork and rename), the expiry sweep tells the user channel nothing, and the store is ruled free of server calls. So the chat surface lands on the chat list when `chat.getChat` answers not found for the active id, which also covers a delete that happened while the tab was closed.

## Why

chatDeleted reaches chatDeletedFromList in packages/client/src/state/active-chat-store.ts only through a mounted room or a Chats list row. A delete from another tab, a host delete of a shared room or the expiry sweep leaves a stale stored handle, so Chats reopens on a dead id and should stall on the load error with stream.attach retries. This comes from reading the code and has not been run.

## Done when

When the active room's read answers not found the client clears the active chat and shows the chat list, with a component test for a delete from another session while on Home and one for a stale persisted id at load.

## Evidence

Filled at landing: what ran and where its output is.

The product half of 1812. What: `chatDeleted` reaches `chatDeletedFromList` (`packages/client/src/state/active-chat-store.ts:263`) only through a mounted room (`chat-content.tsx:85`) or a Chats list row; `setActiveSection` in `shell-store.ts:207` never touches the room. Why: a delete from another tab, a host delete of a shared room, or the TTL sweep leaves a stale persisted `handle`, so Chats reopens on a dead id, expected stuck "Couldn't load this conversation" with `stream.attach` retries. From reading, not run. Done: a remote delete while on Home returns Chats to landing, proven by a CT. Fix home: `active-chat-store.ts` or a user-channel consumer of `chatDeleted`.

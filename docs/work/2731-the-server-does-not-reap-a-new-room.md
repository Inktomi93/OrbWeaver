---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# The server does not reap a new room while a first send is in flight

## What

`holdRoomForSend` in `packages/client/src/state/active-chat-store.ts` covers only the sending device. The reap verb called from another tab or device can delete the room under a first send, because a send leaves no server trace before its claim: it enters the active turns only after the user row.

## Why

A person with two tabs open can lose the room their first message was going to.

## Done when

The reap verb refuses a room with a send in flight, with a test that uses two sessions.

## Evidence

Filled at landing: what ran and where its output is.

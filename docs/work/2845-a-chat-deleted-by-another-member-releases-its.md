---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: cross-surface-consistency
---

# A chat deleted by another member releases its draft in every room

## What

When another member deletes a chat while the reader is in a different room, the reader's saved draft for the deleted chat stays in storage and is never offered back. Only the open room hears `chatDeleted`; other rooms hear `chatsChanged`, which does not say the chat is gone. Add a user-bus `chatDeleted` event in `packages/contracts/src/user-bus/index.ts`, fan it to members beside `chatsChanged` in the delete verb, and have the client release the draft and raise the existing notice.

## Why

A draft the reader wrote is lost without a word, and its entry stays in storage with no path that can clear it.

## Done when

An integration test shows a member in another room receives the event, and a component test shows the draft is offered in the notice and its stored entry is gone.

## Evidence

Filled at landing: what ran and where its output is.

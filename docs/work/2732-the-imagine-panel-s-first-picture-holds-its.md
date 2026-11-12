---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: authorization-and-visibility
---

# The Imagine panel's first picture holds its room out of the reap

## What

`useGeneratePicture` takes no hold on a new room, and the server claims only after the picture is made, so leaving the room during the whole image call reaps it. `useSendMessage` already holds through `holdRoomForSend` in `packages/client/src/state/active-chat-store.ts`.

## Why

A first picture made in a new room can lose its room when the person looks away.

## Done when

The picture request takes the same hold as a send, with a component test on the production app shell that goes red with the hold removed.

## Evidence

Filled at landing: what ran and where its output is.

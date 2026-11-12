---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: authorization-and-visibility
---

# A send refused because its room is closing says so

## What

When a send meets a reap's delete, the room barrier refuses it as locked and the client shows the busy-room text from `packages/client/src/lib/turn-abort-notice.ts`, which says another reply is generating.

## Why

The user reads a wrong reason and may wait for a reply that is not coming.

## Done when

The room-barrier refusal carries its own reason and the client shows matching text from a production copy module, with a test on the refusal's reason.

## Evidence

Filled at landing: what ran and where its output is.

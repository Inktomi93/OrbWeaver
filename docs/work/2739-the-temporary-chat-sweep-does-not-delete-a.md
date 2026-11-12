---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# The temporary-chat sweep does not delete a room with work running

## What

`createReapTemporaryChats` in `packages/server/src/domain/chat/verbs/chat-lifecycle.ts` deletes a temporary room without the idle close the husk reap takes, so the timed sweep can delete a room while admitted work runs in it.

## Why

A turn that is running writes into a room the sweep has removed.

## Done when

The sweep deletes through the same idle-close step as the husk reap, and a test holds a turn, runs the sweep and finds the room kept.

## Evidence

Filled at landing: what ran and where its output is.

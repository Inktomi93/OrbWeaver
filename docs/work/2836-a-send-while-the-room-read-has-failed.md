---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A send while the room read has failed shows its message

## What

While the room read is failed, the composer refuses Send and the guided fire actions, and shows the reason at the composer: the room did not load, and Retry on the plate loads it. Add the cause to the send gate's refusal vocabulary (`sendRefusalKey` in `packages/client/src/features/chat/lib/next-turn-line.ts`) so the next-turn line and the Send button read one reason.

## Why

A send in this state reaches the server but its message stays hidden under the plate, so the sender sees nothing happen and sends again.

## Done when

a component test on the production room in the failed state shows Send disabled with the visible reason and no request sent. After Retry succeeds, Send is enabled. No toast shows beside the plate.

## Evidence

Filled at landing: what ran and where its output is.

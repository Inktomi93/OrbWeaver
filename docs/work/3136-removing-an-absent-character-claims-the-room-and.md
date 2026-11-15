---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: typed-enforcers
---

# Removing an absent character claims the room and writes nothing

## What

`removeCharacterFromChat` in `packages/server/src/domain/chat/verbs/participants.ts` claims the room before it looks for the seat. When the character holds no present seat it returns without a write, but the claim has already published the husk and replayed its creation stats. The edit verbs and `setSeatKnobs` skip the claim on a no-op.

## Why

The claim-before-write ruling says a verb claims before its first write. A host who removes a character the room never seated has done nothing with the room, so the husk should stay a husk and stay reapable.

## Done when

The claim moves below the absent-seat return, and a test drives the verb against a husk with no such seat and shows the room still unclaimed.

## Evidence

Filled at landing: what ran and where its output is.

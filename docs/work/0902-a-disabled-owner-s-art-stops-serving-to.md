---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: server
---

# A disabled owner's art stops serving to the room, like a departed owner's

## What

The co-participant art query (packages/server/src/entry/compose/co-participant-assets.ts) requires the art owner's seat to be present (leftSeq null) but never checks users.enabled, so a disabled owner's character, persona and attachment art keeps serving to the other members while a departed owner's stops. Route the owner side through the same consent set every other room read uses, presentAndEnabledHumanUserIdsOf (packages/server/src/domain/chat/substrate/participants-humans.ts:61). Exception: the room's held anchor persona keeps serving its avatar while its pin is held (item 885), so a held pin never shows a broken image.

## Why

Owner: follow precedent. The disabled-account containment ruling treats a disabled human exactly like a departed one; art was the one path that did not.

## Done when

A disabled owner's art returns 404 to other members on the original and every variant route, re-enabling restores it, the held anchor persona's avatar still serves while held, and tests cover all three plus the departed-owner case.

## Evidence

Filled at landing: what ran and where its output is.

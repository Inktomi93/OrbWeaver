---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: typed-enforcers
---

# A nominee can accept a host handoff after the nominating host left

## What

`acceptHostHandoff` in `packages/server/src/domain/chat/verbs/participants.ts` checks only that the caller is the pending nominee (`requireHandoffAcceptance` in `packages/server/src/domain/chat/guard.ts`). It never checks that the outgoing host is still the present host. A host self-leave archives the room and stamps the host's seat as left, but it does not clear `chats.pendingHostUserId`, so the nomination survives the leave. The accept then runs the swap with no present old host (the verb handles a null `oldHostUserId`) and the rpg actor re-key runs on the old host's copies. Verified by reading: `selfLeave` leaves the pending nomination in place, and the accept verb reads the absent host as null and goes on. Not verified: whether a kick or an account disable also leaves the nomination live, and whether the archived room stays reachable by the nominee.

## Why

A nomination is the host's offer. Once the host has left, the offer may no longer be one they stand behind, and the accept moves authority and copies of their cards without them.

## Done when

The owner rules whether a nomination ends when the host leaves. If it does, the leave clears the nomination or the accept refuses an absent old host, and a test shows a nominee refused after the host left.

## Evidence

Filled at landing: what ran and where its output is.

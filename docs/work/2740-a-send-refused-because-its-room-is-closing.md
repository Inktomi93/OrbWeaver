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

A refused send carries no reason the client can read. When a send meets a reap's delete, the room barrier refuses it as locked and the client shows the busy-room text from `packages/client/src/lib/turn-abort-notice.ts`, which says another reply is generating. When the host's account is disabled or gone, the server answers not found, as for a missing room, and the client shows the generic send failure and keeps the draft.

## Why

The user reads a wrong reason: they wait for a reply that is not coming, or take an unavailable host for a broken send.

## Done when

The send refusal carries one typed reason field with a closing-room and a host-unavailable value. The client maps each to text from a production copy module, and the host-unavailable text never says the account is disabled. The roster carries no account state. A test asserts each reason through the production send.

## Evidence

Filled at landing: what ran and where its output is.

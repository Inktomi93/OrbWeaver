---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: chat
plan: typed-enforcers
---

# Every room write after a claim takes the claim, and the engine carries the turn verb's own token

## What

The claim takes a `RoomAdmission` and returns a `RoomClaim`, and the shared commit doors require it. Writes outside those doors still run after a claim with no type behind the order. These are raw drizzle writes in the chat injection verbs, `setSeatKnobs`, `removeCharacterFromChat`, and the edit verbs that hide a message, edit a tool call, move, delete or re-attribute a persona. `mintLiteGame` in `createGame` is one too, as is the engine's turn commit after `resolveTurnBase`, `forceCharacterTurn` and `resolveRequestTurn`. `fireRpgTurnCompleted` in `packages/server/src/domain/chat/engine/engine.ts` mints a stand-in admission at a listed `orb/room-token-mint` site because the engine does not carry the turn verb's token.

## Why

A write that does not take the claim can be moved above the claim and still compile, so the claim-before-write order holds only by placement for these sites.

## Done when

Each raw post-claim write goes through a named persistence door that takes `RoomClaim`. The turn verbs thread their claim through engine prep to the turn commit and to `onTurnCompleted`. The `fireRpgTurnCompleted` row is removed from `ROOM_TOKEN_MINT_SITES` in `tooling/src/eslint/room-token-mint.ts`, and `tests/server/domain/chat/contract/claim-order.test-d.ts` covers the new doors.

## Evidence

Filled at landing: what ran and where its output is.

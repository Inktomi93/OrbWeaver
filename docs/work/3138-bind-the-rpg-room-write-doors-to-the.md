---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: rpg
plan: typed-enforcers
---

# Bind the rpg room write doors to the claim's room

## What

The rpg persistence doors take a `RoomClaim` and never read it: `insertJournalEntry`, `updateJournalEntry` and `deleteJournalEntry` in `packages/server/src/domain/rpg/persistence/journal.ts`, `updateGame`, `upsertSheet`, `insertCheckpoint`, `writeHandSnapshot` and `updateSnapshotState`. They key on the game id. `HandWriteRoom` in `packages/server/src/domain/rpg/snapshot-edit.ts` pairs a game with an admission and never checks that both name one room. Every current caller pairs them from the same chat id.

## Why

A claim for one room licenses a write to another room's game, so the claim-before-write order holds for the claimed room only by the callers' pairing.

## Done when

Each rpg door scopes its write to the claim's room (a game whose chat is `claim.chatId`), or the hand door refuses a game whose chat differs from the admission's, and a test plants a mismatched pair and shows it refused.

## Evidence

Filled at landing: what ran and where its output is.

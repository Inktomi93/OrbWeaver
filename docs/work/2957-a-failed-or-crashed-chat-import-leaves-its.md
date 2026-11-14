---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
plan: import-robustness
---

# A failed or crashed chat import leaves its synthetic group character behind

## What

`planOneChat` in `packages/server/src/domain/chat/persistence/import-write.ts` mints the room's synthetic group character before the opening stage. Neither the cleanup of a failed landing nor the boot sweep in `packages/server/src/domain/chat/persistence/import-landing.ts` removes it.

## Why

Every failed or crashed import of a chat with a narrator slot leaves a synthetic character no room seats, and it stays in the owner's tables.

## Done when

A failed landing and the boot sweep each leave no synthetic group character for the room they removed, shown by a case that fails a narrator chat's landing and one that sweeps a crashed one.

## Evidence

Filled at landing: what ran and where its output is.

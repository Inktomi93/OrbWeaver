---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The chat bundle export's unresolved strike handle branch has no product path

## What

`loadMemoryStrikes` in `packages/server/src/domain/export/verbs/export-chat-bundle.ts` maps a scoped strike whose character has no handle in the room's seat handles to a null handle. `loadSeatHandles` reads every participant row with a character, departed seats included, and a deleted character nulls the strike's character column, so a strike with a character id and no seat row looks unreachable. A case that unseats the struck card still exports its handle.

## Why

A branch the product cannot reach is either a missing proof or dead code, and its comment claims a behavior nothing exercises.

## Done when

Either a composed-root case reaches the branch and shows the strike travelling as a shared strike, or the branch is closed with a type or removed, with the comment fixed in the same change.

## Evidence

Filled at landing: what ran and where its output is.

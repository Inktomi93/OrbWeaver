---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# Chat persistence and assembly still read the characters, personas and assets tables

## What

`packages/server/src/domain/chat/persistence/visible-rooms.ts`, `packages/server/src/domain/chat/persistence/queries.ts`, `packages/server/src/domain/chat/persistence/background-write.ts`, `packages/server/src/domain/chat/persistence/import-write.ts`, `packages/server/src/domain/chat/persistence/seat-characters.ts`, `packages/server/src/domain/chat/persistence/plugin-reads.ts`, `packages/server/src/domain/chat/persistence/identity.ts`, `packages/server/src/domain/chat/persistence/reactions.ts` and `packages/server/src/domain/chat/assembly/world-info/pool.ts` import `characters`, `personas` or `assets` from `@orb/db`. The co-participant art gate in `packages/server/src/domain/chat/persistence/co-participant-assets.ts` no longer does; it reads those rows through handle-free ops the owner domains build at compose.

## Why

A domain may not read tables it does not own (`docs/law/Core-0-Architecture-and-Structure.md` §4). Each such read skips the owner's own scope checks and breaks when the owner changes its schema.

## Done when

Each listed file reads only chat tables and gets character, persona and asset rows through an op its owner domain builds, and the import restriction drafted for the art gate covers all of `packages/server/src/domain/chat/`.

## Evidence

Filled at landing: what ran and where its output is.

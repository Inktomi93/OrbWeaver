---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: rpg
---

# The rpg import overlay refuses an importer who no longer hosts the room

## What

`createImportRpgGame` in `packages/server/src/domain/rpg/persistence/portability-write.ts` gates only on the room having no game; it checks no host seat. A re-import reaches a claimed room through the importer's claim on its character, so an ex-host can reach a handed-off room. Today that path always meets a room that already has its game or a file with none, because no verb deletes or resets a room's game. It becomes reachable the moment such a verb exists: a former host then replays an old campaign into the new host's room. The memory strike import op checks the host seat on the same path (`packages/server/src/domain/chat/memory/persistence/import-strikes.ts`). Found by reading the code, not run.

## Why

A member would write room state that only the host may create, once any verb can clear a room's game.

## Done when

The op refuses unless the importer holds the room's present host seat, as the strike op does, and a composed-root case (ex-host re-import after a handoff onto a room with no game) is red without the check.

## Evidence

Filled at landing: what ran and where its output is.

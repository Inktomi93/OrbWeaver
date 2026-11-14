---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# A fork keeps its parent room's memory strikes

## What

A fork copies canon up to the fork point and rebuilds its memory from that canon, but it copies none of the parent's memory strikes, so a scene the host struck in the parent comes back into the fork's prompts. The fork should carry each strike whose span lies wholly within the copied canon, re-keyed to the fork's message ids. The member clamp applies: a forker with a history floor gets only strikes whose span sits at or above that floor, the rule `packages/server/src/domain/chat/verbs/fork.ts` already applies to the compaction checkpoint.

## Why

A host strikes a wrong memory to get it out of the story; forking the room should not undo that.

## Done when

In a composed-root case, striking a scene, forking past it and running a turn in the fork leaves the scene out of the fork's prompt while an unstruck scene stays; a fork point inside a struck span drops that strike; a floored forker's fork carries no strike below the floor.

## Evidence

Filled at landing: what ran and where its output is.

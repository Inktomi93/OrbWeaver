---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
plan: authorization-and-visibility
---

# A member's deleted message cannot lift the host's memory strike

## What

A memory strike stores the ids of the first and last message of its span (`packages/db/src/schema/chat.ts`). When a member deletes their own message at either end of a struck span, that id resolves to nothing, the strike moves to the unmatched list, and the summary that retells the struck scene is admitted to the prompt again. A security review reproduced it: the block read as struck, the member deleted their line, and the same block read as admitted with the strike unmatched. Hiding the line instead keeps the strike. Message sequence numbers are not renumbered by a delete. The migration that created the table is published, so a schema change is a new numbered migration.

## Why

Only the present host may strike or restore a memory. A member who can delete their own message at the edge of a scene undoes the host's strike without that right.

## Done when

A case through the composed root has a member delete their own message at the start, and in a second case at the end, of a struck span; the struck scene stays out of a forced-turn prompt and the strike stays listed as matched. A strike whose every message is deleted is stated and tested. Strikes stored before the fix are covered or the reason they need no cover is stated.

## Evidence

Filled at landing: what ran and where its output is.

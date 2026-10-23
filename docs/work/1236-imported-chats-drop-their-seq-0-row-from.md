---
kind: bug
status: open
updated: 2026-10-23
priority: P1
area: chat
---

# Imported chats drop their seq-0 row from prompt and compaction

## What

`packages/server/src/domain/chat/persistence/import-write.ts` numbers imported message slots from seq 0 while live canon starts at seq 1 (`chat-detail.ts` documents canon from seq 1). `packages/server/src/domain/chat/assembly/shape.ts` returns 0 for no compaction and then filters `m.seq <= coveredThroughSeq`, so the seq-0 row never reaches a prompt; `compaction.ts` applies `compactedAtSeq ?? 0` with `gt(seq, 0)`, so compaction never summarizes it either. Reproduced: an import-born room's first line is absent from every provider request while the same history numbered from 1 keeps it.

## Why

Every chat imported from SillyTavern or a native bundle loses its opening message from the model's view, silently, on launched data.

## Done when

The readers treat absent coverage as no filter so existing 0-based imports are whole; a regression imports a chat and asserts its first message is in the assembled prompt and in the compaction window; the writer's numbering and any renumbering of existing rows are decided and recorded on this item.

## Evidence

Filled at landing: what ran and where its output is.

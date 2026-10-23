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

## Writer decision

The import writer numbers canon from seq 1 (`importedSeq` in `packages/server/src/domain/chat/persistence/import-write.ts`).

- Live canon appends at the head plus 1 over an empty head of 0 (`commitCanonAppend`, `loadMaxMessageSeq`).
- A native bundle carries messages by position and `compactedAtSeq` in the source room's seqs. A 0-based write shifts every row down one against that marker, so the row after the covered span falls under the marker without being in its summary. The seqs line up only when the source room has no seq gaps; a source with deleted rows still misaligns its marker.
- The persona heal matches `seq = index + origin`, where `importSeqOrigin` proves the room's origin from its import-written slots: only the 0-based writer wrote seq 0, and only the 1-based writer wrote seq `count`. A seq match survives a deleted slot. A room that lost both proving slots heals its pin and seat but no slot.

## Existing rows

No migration ships with this item. The readers treat absent coverage as no filter, so 0-based rooms are whole in the prompt and the compaction window.

One residual stays on 0-based rooms imported from a native bundle that carried a marker: the row at the marker's seq plus 1 sits under the marker but is not in its summary. A renumbering migration would close it. Proposed shape, for the owner to decide:

1. Select each chat that has a `messages` row at seq 0.
2. Shift that chat's `messages.seq` up by 1, highest seq first, so the `(chat_id, seq)` unique index never collides.
3. Shift the chat's `chat_participants.join_seq` and `left_seq` values above 0 by 1. A founding seat keeps `join_seq` 0.
4. Leave `chats.compacted_at_seq` alone when the marker came from the bundle. Shift it when a local pass wrote it. The row does not record which one wrote it, so the migration needs a rule for that choice.
5. Check every other seq-keyed plane for the same chat: runtime variable deltas, memory digest positions, and `automation_rule_state` `settledThroughSeq`.

## Evidence

Filled at landing: what ran and where its output is.

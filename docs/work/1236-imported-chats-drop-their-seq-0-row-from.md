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
- A native bundle carries messages by position and `compactedAtSeq` in the source room's seqs. A 0-based write shifts every row down one against that marker, so the row after the covered span falls under the marker without being in its summary.
- The persona heal matches each input message to the stored room's index-aligned `messageIds`, so it heals rooms written by either origin.

## Existing rows

Migration `packages/db/src/migrations/0005_renumber-imported-canon.sql` renumbers every chat that holds a `messages` row at seq 0 so its canon starts at seq 1. A fork of a 0-based room copies its seqs, so the same selection covers it.

### Marker rule

No column records which writer set `chats.compacted_at_seq`.

- `compaction_spend` has no chat id, and only a priced pass writes a row.
- No durable bus event is specific to compaction. The compact verb emits the generic `chatUpdated`.
- A local pass always writes a coverage point equal to the seq of an existing row, and so can a bundle marker.

One bound exists. The import writes `chats.updated_at` from the bundle and `chats.started_at` at the import instant. Every compaction write sets `updated_at` to the current time. A canon turn does not write `updated_at`.

The rule:

- When `updated_at < started_at`, nothing has written the chat row since the import. The marker is the bundle's, so the migration keeps it. It then covers the same source messages it covered in the source room.
- In every other case, the migration shifts the marker by 1 with the rows. It then covers the same messages it covers today.

Why this rule: shifting keeps today's coverage exactly, so it never makes a correct room wrong. Keeping is correct only for a bundle marker, and the rule keeps only where the row proves that.

Residuals:

- A room imported from a bundle with a marker, then edited (title, star, variables), keeps the hidden row at the old marker seq plus 1. The data cannot separate that edit from a local compaction.
- A bundle exported from a 0-based room carries a 0-based marker. When such a bundle was imported and left untouched, the kept marker sits one row low. One summarized row then also shows in the prompt. No row is hidden.

### Planes that move with the rows

| Plane | Change |
| - | - |
| `messages.seq` | plus 1 |
| `chats.compacted_at_seq` | the marker rule above |
| `chats.standalone_variable_deltas[].seq` | plus 1, so deltas fold in the same order against the rows |
| `chat_participants.join_seq` | plus 1 when above 0; 0 already admits every row |
| `chat_participants.left_seq` | plus 1 when set, so a departed seat keeps the last row it saw |
| `chat_segments.seq_start`, `seq_end` | plus 1; the segment hash does not include seqs, so a rebuild would not repair them |
| `chat_events.payload` `$.view.seq`, `$.slotSeq` | plus 1, so a durable replay carries current seqs |
| `automation_rule_state.state` `$.settledThroughSeq` for a rule on the chat | plus 1 when above 0; 0 means no watermark |

Planes left alone:

- `chat_digests.block_idx` counts rows from the start, not seqs.
- `chat_events.seq`, `chat_stream_events.seq` and `chats.stream_seq` are replay cursors, not message seqs.
- `session_entries.seeded_through_seq` stores a seeded-turn count (`packages/db/src/schema/sdk-session.ts`).
- `notifications.seq` is a per-recipient cursor.
- RPG snapshots and journals reference messages by id.
- `world_entries.metadata.provenance.span` names no chat, and a book can serve many rooms.

## Evidence

Filled at landing: what ran and where its output is.

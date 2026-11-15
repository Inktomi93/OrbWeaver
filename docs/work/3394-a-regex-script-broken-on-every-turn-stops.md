---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A regex script broken on every turn stops adding a warning row each turn

## What

Each turn or edit writes up to `REGEX_NOT_APPLIED_NAMED_MAX` host-only `regex_script_not_applied` rows plus one overflow row (`packages/server/src/domain/chat/substrate/regex-notice-episode.ts`), so a script that fails on every turn adds the same rows every turn for the room's life; nothing deletes `chat_events` rows short of a chat delete. Keep a room-level record of what the host was already told: the (script id, cause) pairs named in this room, written beside the warning in the same append and checked before naming. Home: one small table keyed (chat_id, script_id, cause) with a told-at stamp, or a `json_set` key on the chat's open metadata column under the one-key-per-writer rule (`chat-metadata-write.ts`). Re-tell when the script's `updatedAt` passes the told-at stamp, so an edit that still fails is named again. Cost: one indexed read and at most `REGEX_NOT_APPLIED_NAMED_MAX` upserts per turn, and the room notice must still show the standing set, so the client reads the told set (host-only) rather than only the latest turn's events.

## Why

The per-turn cap bounds a turn to 9 rows, but a member can still drive 9 rows a turn at the ai-turn rate (about 270 a minute) into the host's room log with one broken host library, and every reconnect reads them only to drop them for a member.

## Done when

A host script that fails on every turn is named once until it is edited, a member's turns add no row for it after the first, the host's notice still lists it, and a composed-root case with a seated member shows the row count flat across several turns.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# The owner rules whether a member may count withheld host-only events from sequence gaps

## What

Host-only warnings (`hidden_tag_broken`, `regex_script_not_applied`, `regex_not_applied_overflow`) and the deception-game reasoning events are withheld from a member by `stripChatEventForMember` (`packages/server/src/domain/chat/substrate/member-visibility.ts`), but their durable rows keep their `seq`, so a member's live and replayed cursors show a gap whose size counts the withheld events. The comment in `packages/server/src/domain/chat/verbs/read.ts` beside the replay scrub calls the gap deliberate. With the per-turn cap a turn withholds at most 9 regex rows, so the gap tells a member roughly how many host scripts failed, never which or why.

## Why

The security review of 3086 found the count observable; it carries no id, cause or name and is not told apart from the other host-only events, so it needs a recorded ruling rather than a silent acceptance.

## Done when

A ruling is recorded: accepted as designed with its reason, or a member's cursor is renumbered or padded so a withheld event leaves no countable gap, with a composed-root case proving the chosen behavior.

## Evidence

Filled at landing: what ran and where its output is.

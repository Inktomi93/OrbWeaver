---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# An exported SillyTavern transcript shows its message times in UTC inside SillyTavern

## What

The chat export (`packages/server/src/domain/export/verbs/export-chat.ts`) writes `send_date` in the humanised am/pm month form as a UTC wall clock (`ST_WALL_CLOCK_ZONE` in `packages/server/src/primitives/serde/chat/index.ts`). SillyTavern reads the am/pm form with no zone, in its own host's zone, so a non-UTC SillyTavern host shows the exported times shifted. The fix is to write the `@` form, which SillyTavern's parseTimestamp reads as UTC, or ISO with `Z`, which SillyTavern itself writes.

## Why

The owner moves chats both ways; an export should show the same hour in SillyTavern that it shows here.

## Done when

The export writes each `send_date` as the `@` form or ISO with `Z`. The round trip through import keeps the identity, and a case proves both.

## Evidence

Filled at landing: what ran and where its output is.

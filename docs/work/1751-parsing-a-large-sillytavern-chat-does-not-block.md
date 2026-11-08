---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# Parsing a large SillyTavern chat does not block the event loop (no gap over 200 ms on 5 MB chats)

## What

Parse a large SillyTavern chat in slices that yield to the event loop.

## Why

The parse of a chat file is one synchronous call: `parseChatJsonl` in `packages/server/src/primitives/serde/chat/index.ts` splits and parses every line with no yield. Its callers are `domain/import/loader/collect.ts` (two sites) and `domain/import/verbs/import-chat-file.ts`. The profile loop in `domain/import/loader/profile-directory.ts` already yields between files, so a single large file is the case left. No test measures event-loop gaps on an import.

## Done when

A test parses a chat of about five megabytes and records no event-loop gap above 200 ms.

## Evidence

Filled at landing: what ran and where its output is.

A folder dry run of fifteen chat files of 63 MiB each, at the upload limits in `packages/contracts/src/uploads/index.ts`, stalled the event loop up to 4.2 s (p99 2.7 s). The measurement is in the 2075 import-preview lane report, `reports/lanes/2026-11-07-import-preview.md`.

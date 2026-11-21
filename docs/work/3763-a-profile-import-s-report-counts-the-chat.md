---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: import
plan: import-robustness
---

# A profile import's report counts the chat messages, swipes and branches it wrote

## What

BulkImportChatsResult (packages/contracts/src/chat/bulk-import.ts) counts chats written, messages, variants and linked branches in packages/server/src/domain/chat/persistence/import-write.ts; neither the import report nor the Runs entry shows them.

## Why

The report is the answer to whether everything came over, and it leaves the chat totals out.

## Done when

The import report and the Runs entry show the chat, message, swipe and branch counts, with a test over a profile import.

## Evidence

Filled at landing: what ran and where its output is.

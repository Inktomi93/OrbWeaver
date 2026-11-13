---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: server
plan: import-robustness
---

# Parsing a large SillyTavern chat does not block the event loop (no gap over 200 ms on 5 MB chats)

## What

Importing a large SillyTavern chat holds the event loop. The parse was the smaller part and now yields between slices of lines. The larger part is the write: `packages/server/src/domain/chat/persistence/import-write.ts` commits a whole chat as one synchronous database batch. Measured through the production chat import on a 5 MB file: about 4,300 messages of ordinary length hold the loop about 0.65 s (1.05 s before the writer moved to multi-row inserts), and about 37,000 short messages hold it about 4.6 s (6 s before). Commit a chat in bounded batches with a yield between them, keeping a killed import invisible and removable.

## Why

A large import freezes every open session for as long as the write runs, and a folder of large chats can starve the health check (2188). The single batch exists so a killed import leaves no rows, so the bounded write must keep a half-written chat hidden and reaped.

## Done when

A test imports a chat of about five megabytes through the production chat import and records no event-loop gap above 200 ms. A test kills an import between batches and finds no listed chat and no dedup claim, so the same file imports again.

## Evidence

Filled at landing: what ran and where its output is.

A folder dry run of fifteen chat files of 63 MiB each, at the upload limits in `packages/contracts/src/uploads/index.ts`, stalled the event loop up to 4.2 s (p99 2.7 s). The measurement is in the 2075 import-preview lane report, `reports/lanes/2026-11-07-import-preview.md`.

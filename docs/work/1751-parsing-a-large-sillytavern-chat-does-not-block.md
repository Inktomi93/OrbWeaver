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

Importing a large SillyTavern chat holds the event loop. The parse now yields between slices of lines and the writer uses multi-row inserts. What is left is the commit: `packages/server/src/domain/chat/persistence/import-write.ts` commits a whole chat as one synchronous database batch, and the time is spent per row in building, preparing and binding the statements, not in SQLite. Measured through the production chat import on a 5 MB file: about 4,300 messages of ordinary length hold the loop about 0.65 s, and about 37,000 short messages about 4.6 s. Candidate design, to be ruled: write a chat's message and variant rows into staging tables in bounded batches with a yield between them, then commit the chat in one batch whose message and variant statements are INSERT ... SELECT from the staging rows, so the atomic step costs no per-row work in the server and no reader ever sees a partial chat. A killed import leaves only staging rows, removed at boot and before the next import. Rejected: committing the chat itself in stages behind the unclaimed-room state, because only the chat list and the stats rebuild hide an unclaimed room, so search, discovery and export would each need the same filter.

## Why

A large import freezes every open session for as long as the write runs, and a folder of large chats can starve the health check (2188). The single batch exists so a killed import leaves no rows, so the bounded write must keep a half-written chat hidden and reaped.

## Done when

A test imports a chat of about five megabytes through the production chat import and records no event-loop gap above 200 ms. A test kills an import between batches and finds no listed chat and no dedup claim, so the same file imports again.

## Evidence

Filled at landing: what ran and where its output is.

A folder dry run of fifteen chat files of 63 MiB each, at the upload limits in `packages/contracts/src/uploads/index.ts`, stalled the event loop up to 4.2 s (p99 2.7 s). The measurement is in the 2075 import-preview lane report, `reports/lanes/2026-11-07-import-preview.md`.

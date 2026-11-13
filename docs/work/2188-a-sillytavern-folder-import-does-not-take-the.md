---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: server
plan: import-robustness
---

# A SillyTavern folder import does not take the stage down

## What

During acceptance, snap marked the review stage unhealthy while a SillyTavern folder import ran on a clone of the owner's data, and rebuilt it. The old server log was overwritten, so the run itself was never read. Measured since through the production chat import: one chat of five megabytes holds the event loop from 0.65 s to 4.6 s while its rows commit as one synchronous database batch (1751), which is long enough to starve a health check across a folder of large chats.

## Why

If a large import crashes the server, users lose the import and every open session; if it starves the health check, the event loop is blocked too long.

## Done when

The same import on the owner-data clone is rerun with the server log kept, and the cause is named; a crash is fixed, and a starved health check is tied to 1751 or fixed.

## Evidence

Filled at landing: what ran and where its output is.

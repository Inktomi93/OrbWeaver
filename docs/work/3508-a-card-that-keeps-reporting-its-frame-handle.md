---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# A card that keeps reporting its frame handle lost costs two fresh mints on every remount

## What

A missed card frame handle now leaves the mint cache in `packages/client/src/features/chat/`. A card that always answers as if its handle were lost gets two mints on each mount of its row, so scrolling it in and out leaves two documents in the reader's frame store each time and pushes the reader's older frames out. The cost stays inside the reader's own account.

## Why

One card can churn the reader's frame store and make their other frames reload.

## Done when

A card's re-mint after a miss is spent once per card per tab, and a component test under `tests/client/features/chat/components/` counts mints across a remount.

## Evidence

Filled at landing: what ran and where its output is.

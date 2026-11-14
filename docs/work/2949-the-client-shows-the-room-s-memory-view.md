---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# The client shows the room's memory view with strike and restore

## What

The server half of the memory view is done: `memoryView`, `strikeMemory` and `restoreMemory`, with the wire shapes in `packages/contracts/src/chat/memory-view.ts`. The client needs the view: each item's anchor, text, keywords, speakers and bucket; the struck entry with its restore control and the items left out with it (`retellsStruck`); the unmatched strikes; and a status line for each empty state (off for the app, off by the host, too short, pending, before your history). Strike ids reach the host only, so a member sees struck items without any control. The recall readout labels in `packages/client/src/features/chat/components/memory-recall-detail.tsx` already name the struck verdicts.

## Why

A player who sees a wrong memory has no way to drop it until the view exists in the app.

## Done when

Component tests mounted through `tests/support/browser/ct-data-providers.tsx` cover: the listed item parts and bucket; each empty status rendering its own state; the host striking an item, the row showing struck with a restore control, and a restore returning it; a member seeing no strike or restore control, and a forced call showing the refusal inline with no toast beside it; a stale strike showing the item-changed refusal and the refreshed view; changed-since-struck and retells-struck marks; the unmatched list with restore for the host only; the recall readout's struck rows; and a phone-width snap of the view.

## Evidence

Filled at landing: what ran and where its output is.

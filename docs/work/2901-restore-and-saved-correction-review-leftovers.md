---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Restore and saved-correction review leftovers

## What

Findings two reviews left outside their items. A card imported without art gains the exporter's placeholder art and new import keys when its own library is restored. A change to a room's updated time that a backup does not carry makes an unedited room land a second copy on restore. A reuse match re-attaches a file's tags to a row written in the app. A failed save of a Rewrite correction shows a toast and no failure line in the dialog (`packages/client/src/features/chat/components/rewrite-dialog.tsx`). No component test shows that a member's Rewrite dialog omits the save control.

## Why

Each is a small way a restore or a correction can surprise the owner, and none was in the done line of the item that found it.

## Done when

A self-restore leaves an art-less card without an avatar and adds no asset; an unedited room is reused whatever its updated time; the tag re-attach is ruled and tested; a failed save shows the dialog's failure line; a member's dialog has a case for the missing control.

## Evidence

Filled at landing: what ran and where its output is.

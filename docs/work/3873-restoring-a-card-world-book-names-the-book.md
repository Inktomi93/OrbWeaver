---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: import
lane: wt/agent-ab48c9f67c391d41f
plan: unwired-code
---

# Restoring a card world book names the book and its entry count

## What

cardLorebookRestoreResultSchema returns characterId, worldBookId and entryCount; character-restore-book-action.tsx reads ok, error and replaced only. The success note says restored with no count and no link.

## Why

The result holds what the user would want to see and the screen drops it.

## Done when

The success note states how many entries were restored and opens the restored book; characterId leaves the schema; a CT covers a restore.

## Evidence

Filled at landing: what ran and where its output is.

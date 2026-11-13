---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# A draft outlives its room when you delete the chat yourself or are not in it

## What

Leaving a room that was deleted elsewhere releases its draft entry and offers the text back. Two paths do neither: deleting the chat yourself leaves an orphan draft entry, and a chat deleted while you are in another room loses its draft with no notice.

## Why

An orphan entry is kept for a room that cannot be opened, and a silent loss is the case the notice exists to prevent.

## Done when

Both paths release the draft entry, and each either offers the text back or is shown to need no offer, with a component test per path that fails when the release is removed.

## Evidence

Filled at landing: what ran and where its output is.

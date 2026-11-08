---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: ui
plan: cross-surface-consistency
---

# New chat seats Blank chat by the room left for a whole list row

## What

At 300% text on a phone the pinned row now holding Blank chat covers the character list: only a sliver of the list shows at 390x844 and 393x873, and a tap on the visible top row hits Blank chat. At 1280x800 and 300% Blank chat is still below the fold, because the dialog sits under the cramped height threshold. Base the pinned-row placement on the room left for one whole list row above the pinned row, not on dialog height alone.

## Why

The picker's main job is choosing a character, and at large text it now hides the list on phones and hides Blank chat on the common desktop size.

## Done when

At 300% text on 390x844, 393x873 and 1280x800 at least one whole list row and Blank chat are both visible and separately hittable, with CT cells in new-chat-picker-skeleton.ct.tsx that are red on the current tree. Source: acceptance part 3 report R1 and the 2181 remainder.

## Evidence

Filled at landing: what ran and where its output is.

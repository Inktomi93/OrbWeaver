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

Fixed. One rule in `packages/ui/src/styles/primitives.css` (`dialog-stacked-cramped`) pins Blank chat with Start only where the dialog's height holds the header, the search strip, one whole row and the pinned row, per pointer and per line count (the cq-13-5, cq-14, cq-16 and cq-16-75 height steps, the cq-15 one-line width, the cq-7 width floor). Room is given back first: the dialog title wraps by its words beside Close (header 253px to 163px at 390x844 and 300%), the stacked pinned row drops its inline inset (Blank chat 162px to 144px), and a stacked popup's heading gap is the row step. `docs/law/ui-platform-rulings.md` §8.1 records the rule.

`tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx`, "at rest" cells at 390x844, 393x873 and 1280x800 at 300%, with and without rosters: each hit-tests the first row and Blank chat at three points. All six were red on the base source (row covered on the phones, Blank chat below the fold at 1280x800) and pass after. Every existing skeleton, short-landscape and keystroke cell passes.

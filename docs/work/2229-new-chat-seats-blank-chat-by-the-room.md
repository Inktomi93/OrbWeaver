---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: ui
lane: wt/agent-a7572929e5e574748
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

Fixed. One rule in `packages/ui/src/styles/primitives.css` (`dialog-stacked-cramped`) pins Blank chat with Start only where the dialog's height holds the header, the search strip, one whole row and the pinned row, per pointer and per line count (the cq-12, cq-14, cq-13-5 and cq-16-75 height steps, the cq-15 one-line width, the cq-7 width floor). Where it does not hold them, the action row stops pinning and flows after the list, so nothing it seats covers the first row. Room is given back first: the dialog title wraps by its words beside Close (header 253px to 163px at 390x844 and 300%), the stacked pinned row drops its inline inset (Blank chat 162px to 144px), and a stacked popup's heading gap is the row step and its inset the field step at any width (a wide one kept 1.5rem on each edge: 144px of a 720px dialog at 1280x800 and 300%). `docs/law/ui-platform-rulings.md` §8.1 records the rule.

Touch screens on the wide case, at 300%: 1280x800 is 15rem tall and 1024x768 is 14.4rem, against the 13.5rem coarse step (measured need 13.19rem, 633px of the 720px dialog at 1280x800). Both pin Blank chat with Start, the first row whole (1280x800: row 379-511, pinned row from 512). The cells in `new-chat-picker-blank.ct.tsx` are red with the inset and step reverted to the earlier tip, where the cue took its own line and covered 89px of the row at 1280x800.

1280x720 at 300% with a fine pointer is 13.5rem tall against the 12rem fine one-line step (sum 10.875rem, measured 10.92rem), so a pixel of gutter cannot flip it.

`tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx`, "at rest" cells at 390x844, 393x873 and 1280x800 at 300%, with and without rosters: each hit-tests the first row and Blank chat at three points. All six were red on the base source (row covered on the phones, Blank chat below the fold at 1280x800) and pass after. Every existing skeleton, short-landscape and keystroke cell passes.

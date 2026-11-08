---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a7572929e5e574748
plan: cross-surface-consistency
---

# New chat keeps Blank chat in view on narrow phones at 300% text

## What

After 2181, Blank chat sits in New chat's pinned row, but a stacked dialog under 16rem tall keeps it below the footer. A 360x800 phone at 300% text measures about 15.9rem and a 320 phone at 300% falls under the gate too, so both still find Blank chat below the fold. The leg 10 review also found Blank chat off screen at rest at 300% text on 320x844, on a 1280x720 desktop and on an 844x390 landscape phone. The fix needs a design call: a cue that more actions sit below, or a footer that fits.

## Why

Users at the largest text on common phones still cannot see the way to start a chat without a character.

## Done when

Blank chat is visible without scrolling at 300% text on 320 and 360 phones, a 1280x720 desktop and an 844x390 landscape phone, or a visible cue shows it sits below, with cells in new-chat-picker-blank.ct.tsx.

## Evidence

Fixed by the 2229 rule, with the ruled answer where there is no room: Blank chat follows Start, and the pinned row shows "More below".

- 1280x720 desktop at 300%: pinned. The dialog is 13.5rem tall and 22.7rem wide, so Blank chat and Start share one line; the sum is 13.125rem plus hairlines (636px of 648px).
- 360x800 phone at 300%: below, with the cue. The dialog is 15.9rem tall; two stacked actions need 16.5rem plus hairlines (measured 798px at 390x844 against 764px here).
- 320x844 phone at 300%: below, with the cue. The dialog is 5.9rem wide, under the 7rem floor: Close cannot share the title line (header 253px) and Blank chat's label takes two lines.
- 844x390 landscape phone at 300%: ruled behaviour. The popup is 351px (7.3rem), and the sticky header (3rem Close), the search strip (2.75rem) and one row (2.75rem) already need about 8.5rem, so the sheet has no room for a cue at rest. Under `docs/law/ui-platform-rulings.md` §8.1 a tiny dialog unpins its footer and its body scrolls as one sheet, with Blank chat right after Start. No scroll fade renders on the dialog body there (the body and popup carry no `scroll-fade-y`); at rest the first row is cut at the sheet's foot. No new item: a header cue would be a new door into the shared dialog header for one cell (orchestrator ruling).

`tests/client/features/app-shell/surfaces/new-chat-picker-blank.ct.tsx`: the 1280x720 cell and the 360 and 320 cue cells were red on the base source and pass after; each also hit-tests the first row. The 844x390 cell asserts the ruled sheet: the action row is static, Start is whole once scrolled to, and Blank chat follows it, whole and pressable. It guards the ruled behaviour, which this change keeps.

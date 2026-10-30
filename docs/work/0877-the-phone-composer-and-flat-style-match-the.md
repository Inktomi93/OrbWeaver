---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Phone chat-style text columns match the Moonlit Echoes reference

## What

The composer half is superseded: `cd0dc3c6ea` built the two-row composer from the SillyTavern walkthrough. At 390x844 SillyTavern's composer measures 132.5px including its Guided Generations row, and Orbweaver's measures 106px for the same two rows, so no composer height change is owed.

Remaining: match each chat style's phone text column to its Moonlit Echoes reference at 390x844 and 844x390. The reference values are in `reports/moonlit-reference/codex-2026-10-26-measurements.md` (search `mode: '`), with screenshots beside it. For example, Flat portrait text is 278.5px wide beside a 56px avatar column. Swipe arrows stay out of scope (829-831).

## Why

Owner's bar for the phone chat: as long as the composer and action rows are like his SillyTavern screenshot, he is fine.

## Done when

For each style, the phone text column width and inset match the Moonlit reference within a few pixels in portrait and landscape, or a recorded reason explains the difference. A production-mounted CT pins the measurements, and a side-eye compares the result against the reference screenshots.

## Evidence

Not closed. The reference screenshot (`~/Downloads/SillyTavern.png`) and the SillyTavern container's CSS are not readable from the lane, so no pixel target exists to match.

Measured on the current tree at 390x844, touch: the composer is 106px tall (a 32px command row and a 48px input row); the textarea's `text-align` is `start`; the doors in the command row sit 12px apart; flat style's text starts 46px from the screen edge (the card at 38px plus 8px of inset). The composer is the two-row layout since the redesign, so the old 114px and 23px figures no longer apply.

Needs the owner's reference numbers (composer height, door gap, placeholder alignment, flat inset) before a test can pin them.

---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# The phone composer and flat style match the SillyTavern reference

## What

Side-eye against the owner's SillyTavern reference (~/Downloads/SillyTavern.png): the phone composer is about 23px taller than ST's (the doors sit 12px apart), its placeholder is left-aligned where ST centres it, and flat-style text starts 54px from the edge against about 21px in stock ST. Swipe arrows are out of scope: the per-style swipe foot follows the owner's Moonlit ruling and landed in 829-831.

## Why

Owner's bar for the phone chat: as long as the composer and action rows are like his SillyTavern screenshot, he is fine.

## Done when

The phone composer's height, door gap and placeholder alignment match the reference within a few pixels, and flat style's text inset matches stock ST; CTs pin the measurements and a side-eye compares against the screenshot.

## Evidence

Not closed. The reference screenshot (`~/Downloads/SillyTavern.png`) and the SillyTavern container's CSS are not readable from the lane, so no pixel target exists to match.

Measured on the current tree at 390x844, touch: the composer is 106px tall (a 32px command row and a 48px input row); the textarea's `text-align` is `start`; the doors in the command row sit 12px apart; flat style's text starts 46px from the screen edge (the card at 38px plus 8px of inset). The composer is the two-row layout since the redesign, so the old 114px and 23px figures no longer apply.

Needs the owner's reference numbers (composer height, door gap, placeholder alignment, flat inset) before a test can pin them.

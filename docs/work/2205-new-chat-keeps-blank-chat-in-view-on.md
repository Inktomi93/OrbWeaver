---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
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

Filled at landing: what ran and where its output is.

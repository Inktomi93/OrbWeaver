---
kind: bug
status: blocked
updated: 2026-11-20
priority: P1
area: client
blocked: owner
plan: cross-surface-consistency
---

# With the phone keyboard open the chat screen can still be dragged and scrolled

## What

On an iPhone, with the composer focused and the on-screen keyboard up, a drag on the composer or the screen moves and scrolls the whole page up and down. The shell is meant to fit the visual viewport above the keyboard and hold still, with only the transcript scrolling.

## Why

The composer and the transcript slide away under the finger while typing. The owner reported it from his phone.

## Done when

With the keyboard open the page itself does not scroll or rubber-band on a drag from the composer, the bar or the chrome. The transcript still scrolls. The cause is fixed for every surface with a text field above the keyboard, not the chat composer alone, and it is checked on a real iPhone or the closest faithful substitute. The owner checks on an iPhone that the chat screen no longer drags with the keyboard up and that a long-press text selection drag in the composer still works.

## Evidence

Filled at landing: what ran and where its output is.

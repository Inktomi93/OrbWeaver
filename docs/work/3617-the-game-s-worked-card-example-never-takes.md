---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: rpg
---

# The game's worked card example never takes a slot in the card window

## What

The rpg card-teach block, with its literal card example, is appended to the turn's stored user row, which carries a message id, so resolveFullCards counts it as a stored card. With cardKeepLastX at zero the example is stubbed before it is sent; at one or more it takes a window slot and stubs the model's newest real card. Seen in the provider request of the rpg panels turn test before it turned immersive HTML off.

## Why

The header of resolveFullCards records this failure as fixed; the merged turn-notes path brought it back, so the model loses either its example or its newest card.

## Done when

On every turn path the example rides whole and never takes a window slot, with a turn test that reads the provider request.

## Evidence

Filled at landing: what ran and where its output is.

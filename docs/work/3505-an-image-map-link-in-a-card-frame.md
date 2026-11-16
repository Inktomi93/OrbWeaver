---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: kit
---

# An image map link in a card frame misses the link hand-off and blanks the card

## What

The pinned frame script in `packages/kit/src/card-frame/index.ts` hands an anchor's link to the app and stops other anchor schemes. An `area` element with an address is not read, so its link navigates the frame, which the frame policy refuses and the card goes blank. Found by reading the script and not probed.

## Why

A card link should open through the confirm or do nothing, and never blank the card.

## Done when

An `area` link behaves as an anchor link does, the script's pin is recomputed, and a case in `tests/ui/content/sandbox-frame/` shows the card stays drawn.

## Evidence

Filled at landing: what ran and where its output is.

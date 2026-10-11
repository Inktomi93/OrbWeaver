---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Immersive chat styles use full-width cards with the chip in the header

## What

From the Moonlit desktop-mobile parity side-eye report (F2 F3 F5 F6): echo, whisper, hush and ripple are full-width cards in Moonlit with the chip in the header line; ours shrink to content with a 48px chip gutter, so card widths jump between rows and phones lose about 47px of line. Echo lacks Moonlit's 200px min-height; whisper's band should sit top-right fading left at 0.8 opacity and grow to 55% by at least 125px on phones (ours is centred, opaque and shrinks to 67px); hush should be a filled rounded card with a short right-edge tick.

## Why

The immersive modes lose their Moonlit identity at every width.

## Done when

Each listed property matches the report's Moonlit column at 1280, 1920 and phone, with CTs pinning card width, chip placement, echo min-height and the whisper band box.

## Evidence

Filled at landing: what ran and where its output is.

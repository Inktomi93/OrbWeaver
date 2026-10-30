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

Not changed. The parity report with the Moonlit column is not readable from the lane, and two listed properties collide with recorded rulings.

Measured card widths per row (short user reply, long reply, short assistant reply):

| Style | 390 | 1280 | 1920 |
| - | - | - | - |
| echo | 374, 374, 374 | 477, 630, 512 | 477, 630, 512 |
| ripple | 374, 374, 374 | 477, 630, 512 | 477, 630, 512 |
| whisper | 297, 374, 332 | 297, 450, 332 | 297, 450, 332 |
| hush | 344 each | 736 each | 750 each |

So echo and ripple fill the column on a phone but hug their text on desktop, and whisper hugs at every width. Echo's short cards are 87 to 119px tall (no min-height). Whisper's band is centred and opaque at 50% of the card (55% on a phone). Hush's card paints no fill.

Forks: the adopted whisper preset is a centred 50% banner (Moonlit Glimmer values), which the item asks to move to the top right at 0.8 opacity; hush is a plate by the skin table, which the item asks to make a filled card. Default: keep both until the owner rules. Width and echo min-height are unblocked once the Moonlit values are supplied: the change is a card-fill axis on the `MESSAGE_ROW_SKINS` row, with a test across the three viewports.

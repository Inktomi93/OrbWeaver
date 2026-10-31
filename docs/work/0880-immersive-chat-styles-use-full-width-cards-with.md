---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: cross-surface-consistency
---

# Immersive chat styles use full-width cards with the chip in the header

## What

From the Moonlit desktop-mobile parity side-eye report (F2 F3 F5 F6): echo, whisper, hush and ripple are full-width cards in Moonlit with the chip in the header line; ours shrink to content with a 48px chip gutter, so card widths jump between rows and phones lose about 47px of line. Echo lacks Moonlit's 200px min-height; whisper's band should sit top-right fading left at 0.8 opacity and grow to 55% by at least 125px on phones (ours is centred, opaque and shrinks to 67px); hush should be a filled rounded card with a short right-edge tick.

## Why

The immersive modes lose their Moonlit identity at every width.

## Done when

Each listed property matches the report's Moonlit column at 1280, 1920 and phone, with CTs pinning card width, chip placement, echo min-height and the whisper band box.

## Evidence

Built: card width, the hush card, the whisper banner, echo's minimum height, the speaker tick and the chip in the header line.

Reference: `reports/moonlit-reference/` captures `194508` (echo), `194600` (whisper) and `194641` (hush), measured by pixel scan, plus the values this item's What carries. Values only in the item text, which the captures and the measurements note do not show, are marked.

Card width. Echo, whisper, hush and ripple cards span their column up to the bubble cap, so every row is one width (`FILL_COLUMN`, `packages/client/src/features/chat/components/message-box.tsx`). The cap is the `--reading-bubble-cap` token (65ch), so Moonlit's 932px desktop card is 650px here: a recorded difference, the reading measure.

Whisper banner, echo minimum height and tick (item 1444 primitives, applied in the skin components): the banner sits at the card's top right, half its width, and fades left (`featherToward`); an echo card is at least `immersive.echo-min-height` (198px measured); hush and whisper end each card with a 3px by 26px speaker tick (`tickEnd`).

From the item text only: the banner image rests at `immersive.whisper-band-opacity` (80%, `artDim` on `Stack`) and brightens to full under the pointer where it opens full size; on a phone the banner is 55% of the card and at least `immersive.whisper-band-min-height-phone` (125px) tall.

Chip in the header line. `RowSkin.chipPlacement` (`gutter` or `header`, a required field of the skin table) seats the chip: echo, whisper and hush put it first in the speaker header inside the card; the other skins keep the gutter, and ripple has no chip (its portrait is welded). `identitySlots` (`packages/client/src/features/chat/lib/row-placement.ts`) decides the slot for the settled row; the streaming ghost follows the same field so a turn does not move its chip when it settles. A mirrored user row packs the chip at the trailing end of the header, after the name, as Moonlit draws it. The cards no longer give 32px to a gutter chip, so on a phone they are as wide as Moonlit's rows allow.

Recorded differences from Moonlit:

- The card is 650px at most on a desktop (reading measure).
- The tick is 40px below the card top in both styles (Moonlit centres it on an avatar chip it draws 78px tall inside the card; here the chip is the reader's own size). Moonlit's whisper tick is 70px down.
- The banner is the server's 3:1 crop, 108px tall at a 650px card where Moonlit's is 100px.
- Echo and whisper drop the chip for a speaker whose art slot paints the fallback letter (no image), so a speaker without an image shows no chip in those two styles. This is the existing rule against showing the letter twice.
- The 0.8 opacity is pinned in the primitive CT only: the corpus speakers have no image, so a production room never paints the banner image to measure it.

Tests:

- `tests/client/features/chat/components/platform-immersive-card-width.suite.ct.tsx` (production room through `ChatRoomShellStory`): one card width per style at 390, 1280 and 1920; the hush fill; the whisper band (half the card, flush to its top and right, fading left; at 390px 55% and at least the minimum tall); the echo card height at three widths; the hush and whisper tick against the tokens; hush's chip inside the card and on the header line at 390 and 1280. Red on the old source: the two chip cases and the phone band failed (the 19 other cases passed). Green after, in Chromium and WebKit.
- `tests/ui/styles/css-ownership.ct.tsx` pins `artDim` against its token and the hover return.
- `chat-style-skins.ct.tsx` counts only a card's own child as its welded portrait; `platform-phone-text-columns.suite.ct.tsx` re-records hush (+8: 14.4 for padding, -6.4 for the 368px column against Moonlit's 374.4px card).
- `tests/client/features/chat` on Chromium: 243 passed with `css-ownership`.

Captures of every chat style at 1280x900, 1920x1080, 390x844 and 844x390 are taken from a throwaway CT through the production room, before and after the tick change (the isolated snap stage has no chats to open); see the item 1444 Evidence for the differences noted against the captures.

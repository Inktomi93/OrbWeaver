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

Card width and the hush card are done. The whisper banner, echo's minimum height and hush's tick are open.

Measured against the Moonlit screenshots in `reports/moonlit-reference/` (desktop captures `194508` echo, `194600` whisper, `194641` hush): Moonlit draws all four as full-width cards. The whisper banner sits at the top right, half the card wide and 100px tall, fading to the left. Hush is a filled rounded card with a short tick at its right edge. Echo's card is about 200px tall (198px measured) with art on the side away from the speaker's chip. Where this item and the earlier adopted whisper preset (a centred 50% banner) disagree, Moonlit wins.

Done:

- Card width. Before: echo and ripple cards were 477, 630 and 512px for a short user reply, a long reply and a short assistant reply at 1280 and 1920, and whisper 297, 450 and 332. Echo, whisper, hush and ripple cards now span their column up to the bubble cap, so every row is one width (`packages/client/src/features/chat/components/message-box.tsx`, `FILL_COLUMN`). The cap is the `--reading-bubble-cap` token (65ch), which `2ec781f09c` pinned for ripple, so Moonlit's 932px desktop card is 650px here: a recorded difference, the reading measure.
- Hush card. The skin table row moves hush from `plate` to `bubble` with a card-pinned header (`packages/client/src/features/chat/lib/message-row-variants.ts`), so each row is the role's filled, rounded card with the speaker stripe.
- Test: `tests/client/features/chat/components/platform-immersive-card-width.suite.ct.tsx` (component test; production room through `ChatRoomShellStory`; styles derived from `MESSAGE_ROW_SKINS`) at 390, 1280 and 1920 plus the hush fill and radius. Red on the old source: 8 failed (whisper at 3 widths, echo and ripple at 1280 and 1920, hush fill). Green after, in Chromium and WebKit. `chat-style-skins.ct.tsx`, `platform-transcript-identity.suite.ct.tsx` and `platform-phone-text-columns.suite.ct.tsx` stay green.

Open, with what each needs:

- Whisper banner at the top right, half the card wide and fading to the left: the feather recipe fades to the bottom only (`orb-art-band` in `packages/ui/src/styles/primitives.css`), so this needs a direction variant on `Stack` `feather`, a `@orb/ui` primitive the tone lane owns. Opacity 0.8 and the 125px phone minimum are not visible in the screenshots and stay unmeasured.
- Echo's roughly 200px minimum height: needs an `immersive` size token in `packages/ui/src/tokens/tokens.json` (tone lane).
- Hush's short right-edge tick: needs a new `artDecoration` treatment in `packages/ui/src/lib/art-decoration.ts`; today hush keeps its leading stripe.

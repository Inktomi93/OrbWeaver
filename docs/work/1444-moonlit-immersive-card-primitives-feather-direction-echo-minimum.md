---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Moonlit immersive card primitives: feather direction, echo minimum height, hush and whisper tick

## What

Add the three `@orb/ui` pieces the Moonlit Echoes parity (items 0880, 0882) needs:

- a direction variant on the `Stack` `feather` mask (`packages/ui/src/layout/variants.ts`, `packages/ui/src/styles/primitives.css`), so Whisper's banner sits top-right and fades left;
- an `immersive` minimum-height size token in `packages/ui/src/tokens/tokens.json`, so an Echo card is about 200px tall at rest;
- a short edge-tick `artDecoration` treatment (`art-decoration.ts`), for Hush's right-edge tick and Whisper's tick.

Then apply them in the chat row skins and pin each one in `platform-immersive-card-width.suite.ct.tsx` against the reference values in `reports/moonlit-reference/`.

## Why

Chat styles match Moonlit Echoes, mobile included (owner). The chat-styles lane measured these three differences against the Moonlit screenshots and could not close them without primitive or token changes.

## Done when

Whisper's banner is top-right with a left fade, an Echo card is about 200px tall at rest, and Hush and Whisper show their edge tick. Each is pinned within a few px of the Moonlit reference in a production-mounted CT on Chromium and WebKit, red before the change.

## Evidence

The three primitives and their use in the chat skins are built.

Reference values, measured with pixel scans of `reports/moonlit-reference/194600-capture-and-measure-whisper-mode.jpg` and `194641-capture-and-measure-hush-mode.jpg` (1920px captures) and the measurements note for echo:

| Value | Moonlit | Token or primitive |
| - | - | - |
| Echo card at rest | 198px | `immersive.echo-min-height` (`12.375rem`), applied to a positioned echo card in `message-box.tsx` |
| Speaker tick | 3px wide, 26px long, flush to the card's right edge, 40 to 41px below its top | `immersive.stripe-width`, `immersive.tick-length`, `immersive.tick-offset` and the `tickEnd` `artDecoration` in `packages/ui/src/lib/art-decoration.ts` |
| Whisper band | top right, 464px of a 932px card, fading to the left | `featherToward="left"` on `Stack` (`packages/ui/src/layout/variants.ts`, `--art-feather-toward` in `packages/ui/src/styles/primitives.css`) and `ms-auto` in `WhisperBand` |

`tickEnd` replaces `stripeStart` and `stripeTop`: no skin draws a leading stripe or a full top edge any more, so both are deleted. The style picker diagrams follow the skins (hush draws its card and a tick, whisper draws its banner at the right and a tick; the `chat-style-stripe` slot is now `chat-style-tick`, with a rename row in `packages/client/src/owner-css/renames.ts`), and the hush description in the picker says tick.

Recorded differences from Moonlit:

- The tick sits 40px below the card top in both styles. Moonlit centres it on its avatar, which is a 78px chip inside the card; the chip here is the 24px avatar outside the card, so there is nothing to centre on. In Whisper the tick sits at 70px in Moonlit (the avatar overlaps the banner) and at 40px here, over the banner.
- The whisper band is 3:1, the server's banner crop, so at the 650px card it is 108px tall where Moonlit's 464px band is 100px.
- Phone proportions (0.8 opacity, 55% wide, 125px minimum) are not in the captures or the measurements note, so they are not changed.

Tests:

- `tests/ui/styles/css-ownership.ct.tsx` (primitive isolation) pins the tick against the three tokens and the left feather. Red on the old source (the tick case read a token that did not exist, the feather case read the same gradient as the downward feather), green after.
- `tests/client/features/chat/components/platform-immersive-card-width.suite.ct.tsx` (production room through `ChatRoomShellStory`) pins the whisper band (half the card within 3%, flush to the card's top and right edges, fading left), the echo card's height at 390, 1280 and 1920 (not below the token, and within 4px of it on a desktop) and the hush and whisper tick against the tokens. Red on the old client source: 6 new cases failed, the 13 existing passed. Green after: Chromium and WebKit.
- `tests/client/features/chat/components/appearance-message-style-section.ct.tsx` counts the diagram's ticks from the skin; `platform-phone-text-columns.suite.ct.tsx` drops hush's 3px stripe part (its column is 3px wider, difference -16 instead of -19).
- `tests/client/features/chat` on Chromium: 234 passed.

Captures: every chat style at 1280x900, 1920x1080, 390x844 and 844x390, before and after, from a throwaway CT through the production room (the isolated snap stage has no chats to open). After: the Whisper band is at the top right and fades left, Hush is a filled card with the tick, an Echo reply card is 198px. Compared with `194508`, `194600` and `194641`: the chip is still outside the card in all three (Moonlit puts it in the header line, which is the row-anatomy lane's), and Moonlit's echo art is about 185px wide against this skin's 192px.

---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
plan: cross-surface-consistency
---

# Moonlit parity P3 bundle

## What

From the Moonlit desktop-mobile parity side-eye report: desktop width caps (bubble 80%, tide 70%); timestamp under the name on phones except echo; asymmetric bubble radii and 18px tide pills; ripple portrait fade, name divider and older-count placement; whisper short right-edge tick instead of a full top border.

## Why

Smaller Moonlit fidelity gaps.

## Done when

Each item matches Moonlit or is ruled with a reason in Evidence.

## Evidence

Built, except the ripple count. Reference: the Moonlit Echoes theme source, [style.css at commit 5336f368a41871275317c60a5bc9a806d59f4000](https://github.com/RivelleDays/SillyTavern-MoonlitEchoesTheme/blob/5336f368a41871275317c60a5bc9a806d59f4000/style.css), found with `websearch` and read with `webread`, and the captures in `reports/moonlit-reference/` (`194745` for ripple). Each token's `$description` cites the lines.

- Width caps. A Bubble card takes at most `reading.bubble-share` (80%, source line 1233) of its row and a Tide column `reading.tide-share` (70%, line 2123; `reading.tide-share-phone` 90% on a phone, line 2136), and neither goes past the reading measure: the derived tokens `--reading-bubble-share-cap` and `--reading-tide-share-cap` are the smaller of the share and `--reading-bubble-cap`. The bubble cap rides `MessageBubble share`; the tide cap rides `Stack columnMeasure="tide"`, because the content column's own stylesheet rule reads its cap from `--column-measure`. The other styles' source sets 100% (lines 1389, 1708, 1865), which is the reading measure here. Moonlit's phone breakpoint is a 1000px viewport; the phone arm here is the existing `@max-cq-28` row step. Tide's phone column now measures Moonlit's 336.6px exactly (`platform-phone-text-columns.suite.ct.tsx`, difference 0).
- Timestamp under the name on a phone, except echo. `RowSkin.phoneStamp` (`stacked` or `inline`, a required field); `renderRowIdentity` stacks the name and timestamp at the phone step, packed to the header's side. `platform-pinned-band-height.suite.ct.tsx` now reads the band from the rendered anatomy: the fill under the rail is the row step plus half the identity cluster's excess over the rail plus a header rule's width, to 0.5px. Moonlit's source does not set this rule (it is SillyTavern's own phone header); the item's side-eye observation stands.
- Bubble and tide corners. Source lines 1237 and 1287: an assistant card is 5px, 20px, 20px, 40px from its start-start corner; a user card is 20px, 5px, 40px, 20px. Tide paragraphs are 18px for both speakers (lines 2132 and 2191). Tokens `radius.bubble-sharp`, `radius.bubble-round`, `radius.bubble-tail`, `radius.pill`, each an alias of a new `primitive.radius` step; `MessageBubble corners` carries the sets and `RowSkin.corners` (`card`, `speech`, `pill`) picks one. The source writes the user card's long corner at the bottom end, where the speaker's chip is.
- Ripple. A hairline under the header across the text column (`RowSkin.headerRule`, `Row divider="bottom"`): capture `194745` shows a 1px rule 20px under the name. The portrait fades into the card at the edge that meets the text: `Avatar fade` (`start` or `end`) over `immersive.ripple-portrait-fade` (64px of the 180px portrait, scanned from the capture); the mask follows the side the portrait welds to for a mirrored user row.
- Whisper short right-edge tick: `tickEnd` (item 1444).

Not built: the message number under the ripple portrait (`#10` in `194745`). It needs the metadata row split into what sits under the portrait and what stays below the card, which is a decision about every metadata item, not a placement.

Tests: `tests/client/features/chat/components/platform-moonlit-card-shape.suite.ct.tsx` (production room through `ChatRoomShellStory`) pins the corners of both roles, the caps against the derived tokens, the tide pill radius, the header rule on ripple alone, the portrait fade direction for both sides, and the stacked or inline timestamp at 390px. Red on the old source: 10 cases (4 desktop, the 6 non-echo phone styles); the echo case passed, as it should. Green in Chromium and WebKit. `chat-style-skins.ct.tsx` expects each skin's corner set; its hover now lands inside every corner radius.

---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: chat
---

# Phone chat-style text columns match the Moonlit Echoes reference

## What

The composer half is superseded: `cd0dc3c6ea` built the two-row composer from the SillyTavern walkthrough. At 390x844 SillyTavern's composer measures 132.5px including its Guided Generations row, and Orbweaver's measures 106px for the same two rows, so no composer height change is owed.

Remaining: match each chat style's phone text column to its Moonlit Echoes reference at 390x844 and 844x390. The reference values are in `reports/moonlit-reference/codex-2026-10-26-measurements.md` (search `mode: '`), with screenshots beside it. For example, Flat portrait text is 278.5px wide beside a 56px avatar column. Swipe arrows stay out of scope (829-831).

## Why

Owner's bar for the phone chat: as long as the composer and action rows are like his SillyTavern screenshot, he is fine.

## Done when

For each style, the phone text column width and inset match the Moonlit reference within a few pixels in portrait and landscape, or a recorded reason explains the difference. A production-mounted CT pins the measurements, and a side-eye compares the result against the reference screenshots.

## Evidence

Portrait is done within the recorded differences. Landscape stays open on the shell regime.

The reference is `reports/moonlit-reference/codex-2026-10-26-measurements.md` (`.mes_text` widths at 390x844 with touch). `tests/client/features/chat/components/platform-phone-text-columns.suite.ct.tsx` (component test; production room through `ChatRoomShellStory`; styles from `THEME_CHAT_STYLES`) holds every style's text column to Moonlit plus its recorded difference within 4px, and fails when the recorded parts do not add up to that difference. Document was 304px against Moonlit's 360px and now measures 360px; flat was 328px against 278.5px and now measures 308px (`packages/client/src/features/chat/components/message-box.tsx`). Red on the old source: flat. Green in Chromium and WebKit.

Differences kept, each as parts that add up (Orbweaver minus Moonlit, px):

- Flat +32: the 24px small rounded avatar chip against Moonlit's 56px gutter (owner ruling). The text starts 24px inside the card and ends 12px inside it.
- Bubble -16: -24 for the phone cap (four fifths of the column beside the chip against four fifths of the row) and +8 for 12px card padding against 16px.
- Echo +8: the text side pads 12px where Moonlit pads 20px; the 93.5px art side matches.
- Whisper +8: 12px card padding against 16px on each side.
- Hush -19: -30 for the chip and its gap outside the card (Moonlit draws the avatar inside a full-width card), +14.4 for 12px padding against 19.2px, -3 for the speaker stripe.
- Ripple +5.5: 24px of stack padding against Moonlit's 29.5px of measured insets beside the 100px portrait.
- Tide +7.4: the train fills the 344px column beside the chip, where Moonlit's pill column is 90% of the 374px row.

Echo, whisper and ripple stay at their padding difference because the spacing scale has 12px and 24px steps and no 16px or 20px step; hush needs the avatar inside the card, which is `message-row.tsx` (1435 lane). Either is a way to close them.

Landscape (844x390): the shell enters its desktop rail regime at that width, so the room is 746px wide and bubble prose is capped at the reading measure (426px against Moonlit's 630px); flat, document and ripple measure 666, 674 and 426px against 732.5, 814 and 698.5. That is the shell lane's regime and the reading measure, not a style table value, so it is not changed here.

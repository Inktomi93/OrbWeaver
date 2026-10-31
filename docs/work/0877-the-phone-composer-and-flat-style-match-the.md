---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: cross-surface-consistency
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
- Hush +8: +14.4 for 12px padding against 19.2px and -6.4 because the transcript column is 368px where Moonlit's card is 374.4px. The chip now sits in the card's header (item 0880) and the speaker stripe is a tick that takes no room, so neither reduces the column.
- Ripple +5.5: 24px of stack padding against Moonlit's 29.5px of measured insets beside the 100px portrait.
- Tide +7.4: the train fills the 344px column beside the chip, where Moonlit's pill column is 90% of the 374px row.

Echo, whisper and ripple stay at their padding difference because the spacing scale has 12px and 24px steps and no 16px or 20px step.

Landscape (844x390): the shell enters its desktop rail regime at this width, so the room is 746px wide where Moonlit's row is 844px. That share is measured in `tests/client/features/chat/components/platform-phone-text-columns.suite.ct.tsx` (the row's width less the viewport's), not typed. Two styles are pinned with parts that add up, within 4px:

- Flat 666px against Moonlit's 732.5px: the shell's share (-98) and the 32px avatar chip (+32, owner ruling).
- Document 674px against Moonlit's 814px: the shell's share (-98), the 8px between row and column (-8), the page inset of two gutter tokens (-64) and Moonlit's own 30px margin (+30).

Not pinned, with reasons: bubble (426px against 630.4px) is the card hugging the fixture's short lines, not the reading cap, so no reading-measure difference can be recorded from this fixture; echo, ripple and tide follow the card anatomy and the art pane, which item 0880 and the row-anatomy ruling own; whisper and hush were not measured in landscape by Moonlit. A planted wrong Moonlit value (flat 700px) fails the flat case. Green in Chromium and WebKit.

A side-eye comparison against the reference screenshots is not taken: the lane cannot spawn one, so it goes to the orchestrator.

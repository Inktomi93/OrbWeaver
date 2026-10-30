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

Filled at landing: what ran and where its output is.

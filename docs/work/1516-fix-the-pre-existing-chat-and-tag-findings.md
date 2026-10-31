---
kind: work
status: doing
updated: 2026-10-31
priority: P3
area: client
lane: none
plan: cross-surface-consistency
---

# Fix the pre-existing chat and tag findings from the step 4 review

## What

The rendered review of CSS step 4 on the owner's data (`reports/side-eye/2026-10-31-css-step-4-owner-data.md`) found four defects that step 4 did not cause:

- Tag pills are 50px tall at a fine pointer and 62px at a coarse one: a 28px label button sits beside a 36px or 44px remove square in one pill.
- At 1920 the message row is 960px and the composer 750px, so the bubble's left edge sits 105px off the composer's.
- In Light and in the custom theme Celestial Macaron the assistant bubble barely separates from the page, so the bubble style reads as no bubble.
- The refinery focal lane draws a thick left border on a rounded box.

## Why

Comparative acceptance scores these families, so each needs a fix or a recorded reason first.

## Done when

Each finding is fixed at its shared owner with a CT or a measurement, or ruled with a cited reason, and a capture shows the result.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
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

Fixed: the tag pill height. The Remove button in `character-tags-row.tsx` takes the `chip` step, the label button's own step, so a pill is one chip tall at a fine and a coarse pointer. `tests/client/features/character/components/platform-tag-pill-height.suite.ct.tsx` mounts the production row and reads the label and Remove heights and the pill against its own padding and edge; red on the old row (Remove 36 against 28 at a fine pointer, 48 against 44 at a coarse one), green in Chromium and WebKit. The sequence chips (`sequence-chips.tsx`) wore the same Badge-plus-default-square pattern and take the same step: `tests/client/features/preset/components/platform-sequence-chip-height.suite.ct.tsx` mounts the preset editor on a local-server connection, adds a stop sequence and reads its Remove button against the touch-target token's pointer-conditional value and the chip against its own padding and edge; red on the old chip (36 against 28 at a fine pointer, 48 against 44 at a coarse one), green in Chromium and WebKit.

Not fixed, each a design call:

- The 105 px edge offset at 1920: the transcript track is the width dial and the composer track is capped by the reading measure (`orb-composer-track` in `packages/client/src/styles/globals.css`), so a start-aligned bubble and a centred composer differ by half the remainder. Aligning them moves either the composer or the row placement of every chat style; the side-eye report already assigns it to the chat column measure in cross-surface step 4.
- The Light and custom assistant bubble: Light binds `ai-bubble` at L 0.97 against a 0.98 page, and no kit gate floors a bubble's separation from the page. The fix is a bubble-to-page separation constant in `@orb/kit/theme-derivation`, asserted by the token build for the seeds and solved by the carried clamp, with the Light value re-tuned under D71.
- The refinery focal lane: `focalSectionVariants` draws the speaker-ink inline-start border on a `--radius-base` box, which the ui-audit `side-tab` and `border-accent-on-rounded` rules judge; no exemption covers it (`tooling/src/ui-audit/lib/checks-decor.ts`). Replacing the stripe with an edge ring that keeps the glow ends both findings and changes the CD3 focal shape.

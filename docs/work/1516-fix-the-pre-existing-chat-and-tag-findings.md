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

- The 105 px edge offset at 1920: the transcript track is the width dial and the composer track is capped by the reading measure (`orb-composer-track` in `packages/client/src/styles/globals.css`), so a start-aligned bubble and a centred composer differ by half the remainder. Aligning them moves either the composer or the row placement of every chat style. Ruled out of this item: it goes to comparative acceptance (item 1397), where the transcript and composer tracks are judged against the reference.
- Fixed, the Light and custom assistant bubble. `BUBBLE_PAGE_SEPARATION` in `@orb/kit/theme-derivation` floors every bubble fill's painted OKLab distance from the page, and one judge serves the seeds and carried scopes: `bubblePageMisses` runs in the token build's shipped-palette check (`packages/ui/tokens.tones.ts`) and in the carried solve. `bubbleFills` moves a carried base's bubble off the ramp member it binds when that member sits too close (Light's card is 0.015 off the page), first along lightness on the member's side, then the other side, then neutral for a base so saturated that every lightness paints one pixel; `surfaceVarsOn` emits `--color-user-bubble`, `--color-ai-bubble` and `--color-system-bubble` only for a fill it moved. The Light seed's `ai-bubble` is retuned in `packages/ui/src/tokens/themes/light.json` from L 0.97 to 0.95: the distance from the 0.98 page goes from 0.0103 to above the 0.02 floor; the other seeds already cleared it, so no other seed value changed. Pinned by `tests/kit/theme-derivation/bubble-page-separation.test.ts` over every accepted base (red before the solve: a bubble at distance 0 to 0.012 on most bases) and by `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` reading the painted bubble pixels under each seed and each contrast-case base (red on the Light seed before the retune: `assistant 0.0106`). No before and after capture was taken.
- Fixed, the refinery focal lane: `focalSectionVariants` in `packages/ui/src/layout/focal-section/variants.ts` drew the speaker-ink inline-start border on a `--radius-base` box, the shape the ui-audit `side-tab` and `border-accent-on-rounded` rules judge; no exemption covered it (`tooling/src/ui-audit/lib/checks-decor.ts`). It now draws a one-pixel speaker-ink ring (a shadow, so no border) and keeps the glow. `tests/ui/layout/visual-state-boxes.ct.tsx` reads the focal section's four border widths (all equal), its rounded corner, the ring colour against the speaker token and the glow, under each seed and a nested custom scope; red on the stripe (`0px 0px 0px 3px`), green after. No before and after capture was taken.

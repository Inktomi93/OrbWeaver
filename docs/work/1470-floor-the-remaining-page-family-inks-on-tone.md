---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Floor the remaining page-family inks on tone tints

## What

The kit arm is built: each tint recipe names its `pageInks`, and every colored tone holds foreground and muted-foreground on its tints in the seed check, the knob solve, the literal solve and the tone-knobs matrix. The remaining arm moves the call sites D336 sends to `text-on-tint`: the interactive Card hover, the active Tabs and the selection rail on a neutral tint. It lands with the Card, Tabs and selection-rail extractions in item 1421 step 4, which own those primitive variants.

1448 floored the page ink (--color-foreground) on every carried tone tint. Still unfloored: the interactive Card hover paints card-foreground on tint-active, muted-foreground on a tint (selected-row subtitles and meta) has no floor, and the seed palettes have no gate holding page ink on their tints (the token build checks only D336's recipe floors).

## Why

A probe found no regression today, but nothing stops one: a palette change could drop a selected-row subtitle below AA unnoticed.

## Done when

Each page-family ink on a tone tint is either floored by the kit solve and the token build's seed check, or its recipe moves to text-on-tint, with the tone-knobs matrix asserting it.

## Evidence

Landed with step 4e of item 1421: the selection rail, the selected ListRow title, the active Tabs rail cell and the table cells under a selected row paint the tone's `text-on-tint` and no longer the page ink. `tests/ui/primitives/list-row/selected-ink.ct.tsx` holds the carried mid-grey pair on painted pixels and three seed palettes where `text-on-tint` and the page ink differ, in the Chromium and WebKit CT projects. Still open: the interactive Card hover, `muted-foreground` on a tint and the seed-palette gate.

Measured, not fixed. A colored tone already holds `foreground` and `muted-foreground` on its tints in the seed check, the knob solve and the matrix: `pageInks` on `tint` and `tint-active` in `packages/ui/src/tokens/index.ts`, judged by `toneFloorMisses` in `packages/kit/src/theme-derivation/index.ts`. The neutral tone is not judged (`roleFloors` returns the recipe floor alone), and its tints are the ramp's `muted` and `accent`. A throwaway probe over `ACCEPTED_BASES` and the contrast-case `BASES` read the carried palette from `carriedTonePalette(base, carriedInks(base))`. It found `muted-foreground` under 4.5:1 on `accent` (neutral `tint-active`) on 206 distinct bases, `foreground` under 4.5:1 on `muted` on 95 and `card-foreground` on `accent` on 254; the worst mid-grey cases (L 0.42 to 0.45) sit at 4.0 to 4.4:1. The cause is `carriedMutedForegroundPair`, which solves `muted-foreground` over the base, card, popover, sidebar, secondary and muted members and not `accent`, and `carriedForegroundLightness`, which solves `foreground` over the background, raised and card members only.

The two remedies D336 names differ by ink. `foreground` cannot clear both the page and a mid-grey `accent`, so a neutral tint that paints it moves to `text-on-tint`, which the 4e call sites already do; the Card hover's child `Text` that names `card-foreground` is the remaining site. `muted-foreground` can be floored by adding the `accent` member to its host set, which re-derives `muted-foreground` for every carried scope that exists today. That changes shipped output and the accent sweep's cost, so the choice is the owner's.

Landed for the neutral tone's `muted-foreground`. Seeds and carried scopes are judged by one rule: `tint` and `tint-active` carry `neutralPageInks` in `packages/ui/src/tokens/tokens.json` (read by `roleFloors` in `packages/kit/src/theme-derivation/index.ts`), so the token build's shipped-palette check, the knob solve and the tone-knobs matrix all judge `muted-foreground` on the neutral tints. `foreground` is not on the list, because the role's `text-on-tint` is the ink there. Seeds already cleared the pair, so no seed value changed and no seed's look changed. Carried scopes needed the input fixed, not the ink: on 215 of the 2060 accepted bases no neutral ink could clear AA on the neutral `tint-active` (the best ink reached 2.81 to 4.15:1 at L 0.47 to 0.59 on the grey axis while the page cleared 4.65 to 6.83:1), so the accent member of `rampDeltas` is now bound like its siblings by `contrastSafeRampDelta` after the family retraction, and `carriedMutedForegroundPair` solves over it. `tests/kit/theme-derivation/neutral-tint-ink.test.ts` proves zero bases without a passing ink over the 2060, and a mid-grey case where the unbound recipe delta fails and the bound one passes; it was red before the bound (215 misses, and the derived inks threw). The carried accent fill changes on those 215 bases only: it retracts toward the page, so the hover and selected row on a mid-grey custom theme read weaker; the seed palettes are untouched, and the rendered review should look at a mid-grey custom theme. The accent sweep in `tests/ui/content/theme-scope/tone-knobs.test.ts` cost 96.5 s of user CPU before and 104.7 s after (+8%) at a 1-minute load of 24 to 28, so it is not under half its 180 s budget on this box and the change adds to it; the sweep was not optimized further. The `foreground` and `card-foreground` sites, including the Card hover's child `Text`, still paint the page ink on the neutral tint: `Text` voices set `text-foreground` and `text-muted-foreground` by class, and re-pointing them under a tint needs a custom-property remap that cycles through `text-on-tint`, which mixes toward `var(--color-foreground)`. They remain open.

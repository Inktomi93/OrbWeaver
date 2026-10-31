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

Ruled and attempted, then refused with a proof. The ruling was: judge the neutral tone's `muted-foreground` on its tints through the same recipe machinery for seeds and carried scopes, floor it by adding the `accent` member to `carriedMutedForegroundPair`, and move `foreground` and `card-foreground` sites to `text-on-tint`. The judge went in as a vault field on the `tint` and `tint-active` roles (`neutralPageInks`, read by `roleFloors`), so the token build's shipped-palette check, the knob solve and the tone-knobs matrix all judge it. Seeds already clear that pair: `tokens:build` passed with the judge on, so no seed value needed retuning. The carried fix cannot hold. With `accent` in the host set, `derivedMutedForegroundPair` throws "unable to derive a contrast-safe muted/input pair" on part of the accepted-base matrix, and a probe shows why: on 215 of the 2060 accepted bases the best any neutral ink can do on the neutral `tint-active` is below AA even with the polarity's endpoint (black or white), while the page clears. On the grey axis the endpoint reaches 4.00:1 at L 0.47, 3.54 at 0.50, 2.91 at 0.55, 2.81 at 0.56, 3.81 at 0.57 and 4.15 at 0.59 on the accent, against 6.83, 6.00, 4.85, 4.65, 4.70 and 5.11 on the page. No page ink can clear both there, so the only ink that can is the accent's own `accent-foreground`, which is `text-on-tint`. Every site that paints `muted-foreground` on the neutral hover, selected or pressed fill must therefore move to a text-on-tint ink for the muted case as well, and the judge can be added only with those sites moved. That is a new role (a muted ink on tint) and a primitive change across the ListRow, Card and table skins, so the code changes were reverted and nothing was committed. The foreground and card-foreground sites, including the Card hover's child `Text`, are blocked on the same fact: `Text` voices paint `text-foreground` and `text-muted-foreground` by class, and re-pointing them under a tint needs a custom-property remap that cycles through `text-on-tint`, which mixes toward `var(--color-foreground)`.

---
kind: review
status: active
updated: 2026-08-22
---

# side-eye — colorization axis: rendered evidence pairs (#431)

**Lane:** color-evidence · **Issue:** #431 (successor to #285) · **Posture:** evidence only — no verdict is
offered and none is implied; the owner rules. Read-only against the live dev stack (`:5173` / `:8788`).

## What the axis actually is (re-derived, not remembered)

- **Schema key:** `appearance.enableThemeColorization` (`packages/contracts/src/settings/appearance.ts:193`,
  `z.boolean().catch(false).default(false)`). The probes' `maximal` preset turns it on
  (`tooling/src/_shared/appearance-presets.json`); every arm below isolates it with the patch form
  `--appearance '{"enableThemeColorization":<bool>}'` so nothing else moves.
- **DOM handle:** valueless `data-theme-colorization` on `<html>`, written by
  `packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts:81-84`.
- **Entire CSS carrier — two custom properties, declared twice:**
  `packages/client/src/styles/globals.css:417-424` sets `--color-border` and `--color-sidebar-border` to
  `color-mix(in oklab, var(--color-primary) 22%, var(--color-<fg>) 6%)` at `html[...]` and again at
  `html[...] .shell-grid` (ThemeScope shadows the html rule for shell descendants). Nothing else in the tree
  reads the attribute (`rg data-theme-colorization packages/{ui,client}/src` → the two CSS rules, the hook,
  one comment). So the axis is exactly: **every border/hairline token in the app, retinted.**
- **Decoded token delta (owner's Hearth-default dark row, `canvas.getImageData` on a cascade-resolved probe
  span — not eyeballed):** `--color-border` `rgba(255,255,242,0.078)` → `rgba(248,154,93,0.278)`;
  `--color-sidebar-border` `rgba(255,255,255,0.071)` → `rgba(244,151,90,0.278)`. Alpha rises **3.5×** and the
  hue moves neutral → amber. Every other token sampled (`--color-primary`, `--color-foreground`,
  `--color-background`, `--color-card`, `--color-muted-foreground`, `--color-chart-1`) is **byte-identical
  across arms** — the axis touches no text, no fill, no series colour.

**Account state probed first:** the dev row renders with NO `data-theme` (shipped Hearth default),
`data-reduced-motion=true`, no `data-shadow`, no `data-texture`, and colorization **off**. So the `off` arm
below is also the account's real state; the patch is applied to both arms anyway so the two runs differ by
exactly one key.

## The instrument reach, in one table

`strong-diff` = share of the 1280×800 frame whose RGB moved by >30 (sum of channel deltas); `warm px` =
share of frame pixels with an amber cast (`r>g>=b`, `r-b>=25`). Both from `sharp` raw-buffer decodes of the
committed PNGs (`reports/tmp-color-evidence/ce-diff.mjs`, `ce-warm.mjs`).

| Surface (arm pair) | strong-diff | warm px off → on | data-ink touched? |
| - | - | - | - |
| Analytics — overview | 0.23% | — | **no** (bar-list canvases byte-identical) |
| Analytics — Time tab (histograms) | 0.68% | 3.00% → 3.66% | **yes** — grid + axis lines |
| Analytics — Time tab, `--theme Light` | 0.67% | — | **yes** — same, milder |
| Heatmap (element shot) | — | — | **yes** — cell borders + the ramp's low end |
| Presets | 0.51% | 0.63% → 1.13% | no data-ink present |
| Refinery | 0.96% | 0.38% → 1.34% | no data-ink present |
| Corpus (home) | 0.77% | 1.80% → 2.57% | no data-ink present |
| Corpus — Map tab (scatter) | 0.73% | — | **no** (scatter draws no axis) |
| Databank | 0.40% | — | none on this account (empty) |

The presets figure (**0.51%**) reproduces the number quoted in #431's body from the #285 pass, measured here
by an independent instrument.

## Per surface

### 1. Analytics — overview (the default landing)

- off `reports/snaps/ce-analytics-off.png` · on `reports/snaps/ce-analytics-on.png`

0.23% of the frame changes, and the changed rows are almost entirely `y=47` (the topbar's full-width hairline,
1280 px of it) plus the ⌘K jump pill's rim at `y=8`/`y=39`. The Momentum bar-lists are **untouched**: both
canvases return identical opaque-pixel counts (7670 and 11695) and identical top-colour histograms, because
`bar-list/option.ts:107` sets `axisLine:{show:false}` and its series/label colours come from
`color.chart-1` / `color.foreground` / `color.muted-foreground`, none of which the axis moves. The stat
figures, dividers between Year-in-review / Rhythm / Economics, and all prose are unchanged in hue and
contrast.

### 2. Analytics — Time tab (histograms) — the surface where the axis reaches data-ink

- off `reports/snaps/ce-analytics-time-off.png` · on `reports/snaps/ce-analytics-time-on.png`

The two `<Histogram>` charts' **grid and axis lines** change from neutral to amber: sampled inside the plot
box (region 960,160 300×160), the line pixels go `rgb(29,27,24)` → `rgb(76,48,29)` while the plot background
`rgb(10,8,6)` and the series bars `rgb(203,103,25)` are pixel-identical and identically counted in both arms.
The cause is `histogram/option.ts:21,27` — `axisLine` and `splitLine` both take `colors.axisLine`, which
`chart/use-chart-theme.ts:41` binds to `TOKENS["color.border"]`. Measured side effect: **grid-line contrast
against the plot ground rises 1.16:1 → 1.66:1 (+43%)**, and the grid now shares the hue family of the bars
(grid `76,48,29` vs bars `203,103,25` — same hue, different lightness), so hue no longer separates figure
from ground on this chart; lightness alone does.

### 3. Heatmap (Analytics → Time, element shot) — the ramp's low end moves

- off `reports/snaps/ce-heatmap-off.png` · on `reports/snaps/ce-heatmap-on.png`

Every cell in the 7×24 weekday×hour matrix gains a warm rim, and the axis rules turn amber. This is two
separate consumptions of the same token in `heatmap/option.ts`: the cell `itemStyle.borderColor` (line 73)
and — the load-bearing one — `visualMap.inRange.color = [colors.axisLine, colors.series]` (line 67), i.e.
**the low end of the intensity scale IS the border token**. Off, the ramp runs neutral-dark → amber, so hue
carries intensity alongside lightness; on, it runs warm-dark → amber, a single-hue lightness ramp
(low-end cell fill measured `rgb(1,1,1)` → `rgb(6,4,2)`/`rgb(17,10,6)`; both remain \~1.05:1 against the panel
ground, i.e. still effectively invisible at the bottom of the scale in either arm).

### 4. Analytics — Time tab under `--theme Light` (polarity arm)

- off `reports/snaps/ce-light-analytics-time-off.png` · on `reports/snaps/ce-light-analytics-time-on.png`

Same mechanism, smaller amplitude. Plot ground `rgb(246,242,239)` and bars `rgb(248,148,70)` are identical
across arms; the grid lines go `rgb(219,215,211)` (neutral gray) → `rgb(219,194,172)` (warm tan), contrast
against the plot ground **1.29:1 → 1.53:1 (+19%)** versus +43% on the dark row. Hairline-vs-surface follows:
1.29 → 1.55 (card) and 1.23 → 1.53 (sidebar), against dark's 1.23 → 1.76 / 1.16 → 1.70.

### 5. Presets

- off `reports/snaps/ce-presets-off.png` · on `reports/snaps/ce-presets-on.png`

0.51% strong-diff, concentrated in the CONTEXT readout: the three kicker hairlines (ACTIVE PRESET /
EFFECTIVE GENERATION / CAPABILITY) go amber, as do the RAIL|LIST and CONTENT|CONTEXT dividers, the search
field's rest border and the topbar rule. No number, label, badge or the "Active" pill changes. Warm-cast
pixels 0.63% → 1.13% of frame; the *saturated* accent share is unchanged (0.46% both arms) — the axis adds
low-saturation warm cast, never more accent area.

### 6. Refinery

- off `reports/snaps/ce-refinery-off.png` · on `reports/snaps/ce-refinery-on.png`

The largest whole-frame delta of the sweep (0.96% strong-diff; warm px 0.38% → 1.34%, a 3.5× rise) purely
because this landing has the most hairlines: the character-picker card, the search field, the 100-row list's
bottom rule, and the three Score/Rewrite/Analyze step cards all gain warm rims. There is **no data-ink on
this surface in its default state** — the axis reaches only container edges here.

### 7. Corpus (home) and Corpus — Map tab

- home: off `reports/snaps/ce-corpus-off.png` · on `reports/snaps/ce-corpus-on.png`
- map: off `reports/snaps/ce-corpus-map-off.png` · on `reports/snaps/ce-corpus-map-on.png`

On the home surface the eight visual-family row cards, the READINESS rules and the pane dividers warm up
(0.77% strong-diff); the row thumbnails, the CTA and the amber focus ring on the search field are unchanged.
On the Map tab the `<Scatter>` canvas is **untouched** — its option builder draws no axis or split lines, and
all 327 points already paint `color.chart-1`; only the surrounding panel/card edges change (0.73%, all of it
chrome).

### 8. Databank

- off `reports/snaps/ce-databank-off.png` · on `reports/snaps/ce-databank-on.png`

**Coverage limitation, stated rather than papered over:** this account's databank is empty ("No documents
yet"), so the surface carries no instrument content. What changes (0.40%) is the search field, the
"Add a document" button rim, the pane divider and the topbar rule. A databank arm with real documents +
bank-health figures was not available to this pass.

## Measured side effects (facts, not recommendations)

1. **No text contrast moves anywhere.** The axis writes only `--color-border` / `--color-sidebar-border`; the
   full resolved-token dump per arm is identical on foreground, muted-foreground, card, background, primary
   and chart-1. No `--contrast` verdict changes; nothing crosses 4.5:1 in either direction.
2. **Non-text contrast (WCAG 1.4.11) improves but stays below 3:1 in both arms.** Hairline vs its surface,
   dark row: 1.23 → 1.76 (card), 1.19 → 1.70 (page), 1.16 → 1.70 (sidebar). Neither arm reaches the 3:1
   floor; hairlines here are decorative separators, not boundaries a user must perceive to operate the UI.
3. **Accent budget (UX rule 4, accent ≤10% of viewport) is not threatened.** Warm-cast share peaks at 3.66%
   of frame (analytics Time, on) and the *saturated* accent share is unchanged on every surface but that one
   (2.60% → 2.67%). The axis spreads a low-alpha warm cast, it does not grow accent area.
4. **`pnpm design-audit` cannot see this axis.** Analytics → Time, both arms: `findings=3 p0=0 p1=0 p2=0 p3=3`,
   identical census (1973), identical rows. The deterministic scanner's accent-border / side-tab rules do not
   fire on colorized hairlines, so this decision cannot be delegated to it.
5. **Charts do not repaint when the axis is toggled live — measured, with a positive control.** On the Time
   tab with colorization off I flipped the exact attribute the app itself writes
   (`use-appearance-root-effects.ts:82`): the DOM card border changed instantly
   (`oklch(.99 .005 60/.08)` → `oklab(.770357 .0848753 .109179/.28)`) while the histogram canvas stayed
   **byte-identical** (same four top colours at 2291/1589/1380/1002 px). Repeating the flip with
   `data-theme` also mutated made the canvas repaint and paint `rgb(248,154,93)` — exactly the colorized
   border colour — at 1272 px. Cause: `packages/ui/src/charts/chart/use-chart-theme.ts:7`,
   `THEME_ATTRIBUTE_FILTER = ["data-theme"]`; the live-token store's MutationObserver is not watching
   `data-theme-colorization`, so canvas chrome is stale until the chart remounts. This is a defect
   **independent of the #431 ruling** — it already bites today on the analytics charts, whichever way the
   reach question is answered. Filing/fixing is the orchestrator's call; this lane did not touch it.
6. **Retraction/caveat on my own instrument:** the in-page canvas census enumerates `<canvas>` by DOM order,
   and that order differed between two arms of the Time tab (a 600-wide vs 408-wide first entry) even though
   the two frames are laid out identically. Index-keyed canvas comparisons from that probe are not
   trustworthy; every chart claim above rests on the PNG region decodes instead.

## Method / instrument coverage

| Instrument | Status |
| - | - |
| `pnpm snap` paired arms (`--goto`/`--context-tab`, `--idle`, `--appearance` patch) | RAN — 9 pairs, logs under the lane scratchpad, PNGs listed above |
| `--appearance` axis isolation (patch form, not `--appearance-preset maximal`) | RAN — one key differs per pair; all other tokens verified identical |
| `--theme Light` polarity arm | RAN — `reports/snaps/ce-light-analytics-time-{off,on}.png` |
| Decoded-pixel colour receipts (`sharp` raw buffers + in-page `getImageData`) | RAN — `reports/tmp-color-evidence/ce-{diff,region,grid,warm}.mjs` |
| `--shot-of` element capture (heatmap) | RAN — `reports/snaps/ce-heatmap-{off,on}.png` |
| `pnpm design-audit` both arms | RAN — identical output, see side effect 4 |
| Live-toggle staleness probe + positive control | RAN — see side effect 5 |
| `--mobile` / pane-state / motion / Lighthouse arms | SKIPPED — out of scope for a single-axis colour-evidence pass; the axis writes two colour tokens and cannot move layout, motion or focus order |
| Databank with real documents; a meter/progress-bearing instrument surface | SKIPPED — no such content on this account (meters read `--color-muted` / `--color-primary`, never the border token, so the axis provably cannot reach them: `packages/ui/src/charts/meter/variants.ts:20-52`, `primitives/progress/variants.ts:18-20`) |

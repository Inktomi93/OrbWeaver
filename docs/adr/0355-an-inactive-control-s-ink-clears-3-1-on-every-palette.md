---
kind: adr
status: active
updated: 2026-11-20
---

# An inactive control's ink clears 3:1 on every palette

## Context

A disabled control dims its whole box to `opacity.disabled`. Its ink is an active ink, such as a tone's `text` or the muted ink, at that opacity over its host. WCAG 1.4.3 exempts an inactive control, but below WCAG 1.4.11's 3:1 the control may not read as present. The owner ruled that a standard applies to every theme, and a theme adjusts to meet it. The standard is never tuned to a theme.

Two shapes were open: derive the disabled ink so it always clears the floor, or judge a theme at save and import and name the failing pair. [D202](0202-theme-accepted-base-foreground-contract.md) gives accepted bases no refused band, and every [D71](0071-theme-palette-pipeline.md) floor derives at the clamp. An author also cannot edit an intent tone's ink, which [D336](0336-tone-roles-and-one-variant-vocabulary.md) holds static. A refusal at save would bring back a band D202 removed and name a pair no author can fix.

## Decision

Every palette derives the opacity an inactive control dims to. The inks never move.

- **The floor.** Every ink an inactive control paints clears `AA_NON_TEXT_RATIO`, 3:1, on its host, with the control's own fill dimmed with it. A pair is judged on the float colour and on the 8-bit pixel.
- **The pairs.** `inactiveInkPairs` in `@orb/kit/theme-derivation` lists them from the D336 recipes: each role floor of every tone, each page ink on a tint under it, and each host's page ink and muted ink, bare and on the text-field fill. A pair over a solid fill is left out, because a disabled solid Button wears the muted pair at full opacity.
- **The step.** `inactiveOpacityPercent` returns the least whole percent, at or above the resting step, at which every pair clears. The resting step is the `opacity.disabled` token. Every pair clears its active floor of at least 4.5:1 at full opacity, so a step always exists, and a miss at full opacity throws.
- **One home for every palette.** The kit owns the pairs and the solve. The token build emits each seed's step into its `[data-theme]` block, and Hearth's into `:root` and the base palette block (`shippedInactiveOpacity` in `packages/ui/tokens.tones.ts`). `clampThemeTokens` emits `--opacity-disabled` for every carried scope, so a custom theme, an imported one and a bubble's box each carry their own step. An accent-only scope over a carried palette re-derives it for its own primary. A seed gets no exemption.
- **Owner CSS.** `--opacity-disabled` is on the owner CSS surface, and owner CSS stays the later winning plane.

The derived step can rise far above the resting step near the black/white crossover. There no ink at the resting step clears 3:1, and the control dims less.

## Consequences

Each seed's disabled controls dim less than the resting step where its own inks need it. A custom theme's disabled controls read as present on any accepted base, with no field to edit and no refusal at save or import.

An accent-only scope over a seed palette is judged by no D336 floor, so its primary's disabled ink is not judged either. That gap belongs to D336.

Pins: `tests/kit/theme-derivation/inactive-opacity.test.ts`, `tests/ui/content/theme-scope/inactive-opacity.test.ts`, `tests/ui/primitives/button/button-disabled-ink.ct.tsx` and `tests/ui/primitives/button/custom-theme-disabled-ink.ct.tsx`.

## Alternatives rejected

- **Derive the disabled ink.** Near the crossover even black or white at the resting step reads under 3:1, so no ink at that opacity can clear the floor.
- **Judge the theme at save and import.** It brings back a refused band D202 removed, and an author cannot edit an intent tone's ink.
- **Lower each tone's `text` knob toward the page ink.** It moves every active ink to serve the inactive state, and it still cannot reach 3:1 near the crossover.
- **Raise the resting step for every palette.** It tunes the standard to the palette that needs it most.

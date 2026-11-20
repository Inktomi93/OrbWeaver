---
kind: adr
status: active
updated: 2026-11-20
---

# An inactive control's ink clears 3:1 on every palette and carries a second signal

## Context

A disabled control dims its whole box to `opacity.disabled`. Its ink is an active ink, such as a tone's `text` or the muted ink, at that opacity over its host. WCAG 1.4.3 exempts an inactive control, but below WCAG 1.4.11's 3:1 the control may not read as present. The owner ruled that a standard applies to every theme, and a theme adjusts to meet it. The standard is never tuned to a theme.

Opacity alone is too weak a disabled signal on a light palette. Where the derived step is high, a dimmed control reads as enabled, which breaks ui-surface-and-interaction-rules §3. A form control's [D159](0159-a-form-control-edge-and-a-decorative-divider.md) edge is also solved to the nearest 3:1 lightness on a carried palette, so no dim of that edge holds the floor.

Two shapes were open for the floor: derive the disabled ink so it always clears the floor, or judge a theme at save and import and name the failing pair. [D202](0202-theme-accepted-base-foreground-contract.md) gives accepted bases no refused band, and every [D71](0071-theme-palette-pipeline.md) floor derives at the clamp. An author also cannot edit an intent tone's ink, which [D336](0336-tone-roles-and-one-variant-vocabulary.md) holds static. A refusal at save would bring back a band D202 removed and name a pair no author can fix.

## Decision

Every palette derives the opacity a fill-less inactive control dims to, and every control kind carries a second disabled signal besides opacity. The active inks never move.

- **The second signal, one home.** `packages/ui/src/lib/disabled-state.ts` spells every opacity, fill and ink a disabled control paints, and each primitive's variants compose its constants. `better-tailwindcss/no-restricted-classes` refuses the spelling in any other `@orb/ui` or client file (`tests/tooling/eslint-ui-law.test.ts`). A stylesheet names no disabled selector, and `selector-disallowed-list` refuses one (`tests/tooling/stylelint-rules.test.ts`). It admits one exception, the disabled CTA ring in `packages/ui/src/styles/primitives.css`. That ring is a pseudo-element painted in the `ui` layer, which sorts after `utilities`, so a class could reach it only with the important modifier:
  - A fill-less control (a ghost, outline or link Button, a toggle, a tab, a row, an item, a bare textarea) dims by the derived step and drops to the muted ink (`DISABLED_STATE`, `DISABLED_DIM`). An active tab's own ink yields to it.
  - A form control drawn by its D159 edge (a text field, a field textarea, a number field, a select trigger, a color field's trigger, a combobox or autocomplete group) never dims its box. The box swaps to the muted fill at full opacity, and its content (the value, the placeholder, a chevron, a stepper glyph) paints the muted ink at the derived step as a colour alpha (`DISABLED_FIELD`). On a dark palette the muted fill sits within a few percent of the field fill, so the dimmed content carries the signal there.
  - A selection control (a checkbox, a radio, a switch) never dims its box. A checkbox or radio swaps to the muted pair at every state, so a checked one drops its accent or quiet fill, and its check or dot takes the muted ink (`DISABLED_SELECTION`). A disabled switch sits on the muted track whether it is on or off, so it is never louder than an enabled switch, and its knob carries the state. The knob is the muted ink at full strength at the on end and dimmed by the derived step at the off end (`DISABLED_SWITCH`). Its track stands apart from an enabled quiet switch that is on by at least 3:1. A slider's rail takes the muted fill and its range and knob the muted ink.
  - A solid fill (a solid Button, a selected chip, a pressed toggle) drops for the muted pair at full opacity (`DISABLED_SOLID`, `DISABLED_PRESSED`).
  - A part paints the state once. A group whose parts carry the state paints none of its own.
  - A state that is not a disabled control takes its own step. A meter's series hidden from others recedes with `opacity-receded`, not the disabled step.

- **The floor.** Every ink an inactive control paints clears `AA_NON_TEXT_RATIO`, 3:1, on its host, with the control's own fill dimmed with it. A pair is judged on the float colour and on the 8-bit pixel.

- **The pairs.** `inactiveInkPairs` in `@orb/kit/theme-derivation` lists them from the D336 recipes: each role floor of every tone, each page ink on a tint under it, and each host's page ink and muted ink, and the muted ink over the muted fill, which a field's content and an off switch's knob paint at the derived step. A pair over a solid fill or a field fill is left out, because a control that paints one swaps to the muted pair instead of dimming.

- **The step.** `inactiveOpacityPercent` returns the least whole percent, at or above the resting step, at which every pair clears. The resting step is the `opacity.disabled` token. Every pair clears its active floor of at least 4.5:1 at full opacity, so a step always exists, and a miss at full opacity throws.

- **One home for every palette.** The kit owns the pairs and the solve. The token build emits each seed's step into its `[data-theme]` block, and Hearth's into `:root` and the base palette block (`shippedInactiveOpacity` in `packages/ui/tokens.tones.ts`). `clampThemeTokens` emits `--opacity-disabled` for every carried scope, so a custom theme, an imported one and a bubble's box each carry their own step. An accent-only scope over a carried palette re-derives it for its own primary. A seed gets no exemption.

- **Owner CSS.** `--opacity-disabled` is on the owner CSS surface, and owner CSS stays the later winning plane.

The derived step can rise far above the resting step near the black/white crossover. There no ink at the resting step clears 3:1, and the control dims less.

## Consequences

Each seed's disabled controls dim less than the resting step where its own inks need it. A meter's hidden series renders at the receded step, 60%, instead of the disabled resting step, 55%. A custom theme's disabled controls read as present on any accepted base, with no field to edit and no refusal at save or import.

An accent-only scope over a seed palette is judged by no D336 floor, so its primary's disabled ink is not judged either. That gap belongs to D336.

Pins: `tests/ui/primitives/disabled-signal.ct.tsx`, `tests/tooling/eslint-ui-law.test.ts`, `tests/tooling/stylelint-rules.test.ts`, `tests/kit/theme-derivation/inactive-opacity.test.ts`, `tests/ui/content/theme-scope/inactive-opacity.test.ts`, `tests/ui/primitives/button/button-disabled-ink.ct.tsx` and `tests/ui/primitives/button/custom-theme-disabled-ink.ct.tsx`.

## Alternatives rejected

- **Derive the disabled ink.** Near the crossover even black or white at the resting step reads under 3:1, so no ink at that opacity can clear the floor.
- **Judge the theme at save and import.** It brings back a refused band D202 removed, and an author cannot edit an intent tone's ink.
- **Lower each tone's `text` knob toward the page ink.** It moves every active ink to serve the inactive state, and it still cannot reach 3:1 near the crossover.
- **Raise the resting step for every palette.** It tunes the standard to the palette that needs it most.
- **Dim a form control and judge its edge in the solve.** A carried edge sits on the floor, so every carried palette would derive a full step and lose the dim with no second signal.
- **Lower the step on light palettes.** One signal cannot be both legible and distinct on a pale ground.
- **Desaturate the control with a filter.** The kit solve cannot judge it, and it composes badly with the focus ring.

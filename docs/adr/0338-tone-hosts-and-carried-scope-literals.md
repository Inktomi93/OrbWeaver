---
kind: adr
status: active
updated: 2026-11-01
---

# Tone washes mix over a host surface, and a carried scope emits literal tone colours

## Context

[D336](0336-tone-roles-and-one-variant-vocabulary.md) derives tone roles from a base, the scope's colors and a host `H`. A tint mixed over the page nearly vanishes on a lighter card, and a mix toward a fixed page colour scales the tone's chroma with every percent it gives up. This ruling owns the host and the carried-scope solve.

## Decision

Hosts. `H` is the surface under the wash, `var(--tone-host, var(--color-background))`. The hosts are `TONE_HOSTS` in `@orb/kit/theme-derivation`: `background`, `surface-raised`, `card`, `popover` and one host per message bubble role, `user-bubble`, `ai-bubble` and `system-bubble`. Each has a generated `tone-host-<host>` utility that sets `--tone-host` to that surface's colour on the element that paints it. A surface primitive wears the utility beside its fill: Card's `surface` variant, the `GROUND` fills, `POPUP_SURFACE`, `MODAL_SURFACE`, `MESSAGE_BUBBLE_GROUND` and each primitive that paints a card or popover fill around content. A bubble's seed fills differ from the ramp's, so each role is its own host. A bubble paints no selected, hovered or active fill, so its page inks are not judged over a tint there; every other floor and the separation are. A carried scope judges a bubble at the ramp member the base token binds it to (`user-bubble` to secondary, `ai-bubble` to card, `system-bubble` to muted); a scope that picks a bubble fill is not judged on the pick. A box that paints a tint, such as a soft Card, sets no host, so its own wash mixes over the surface behind it. Unset, `--tone-host` is the guaranteed-invalid value and the wash mixes over the page. Every seed palette block and every scope that paints its own background reset it to `initial`, so a nested palette never mixes over an outer palette's card.

Every floor is judged with `H` on each of `TONE_HOSTS`, and on each host a tint's `foreground` page ink is that host's own ink: `card-foreground` on a card, `popover-foreground` on a popover. On a seed palette, a colored tone's tints also sit at least `TONE_TINT_SEPARATION` off each host.

Carried scopes. A carried scope emits each colored tone's `text`, `text-on-tint`, `tint` and `tint-active` as literal colours, `--tone-<tone>-<role>`. The `[data-tone]` block reads the literal before its mix, `var(--tone-<tone>-<role>, color-mix(...))`, the concrete-colour channel the chart ramp already uses. The root and every seed palette block declare each literal `initial`, the guaranteed-invalid value, and each knob at its default, so a seed palette paints its own mixes, even nested inside a carried scope. The clamp solves each literal's lightness on the tone's own hue:

- A tint keeps at least `TONE_TINT_MIN_CHROMA` where the tone and the gamut allow. One literal serves every host, so it sits at least `TONE_TINT_SEPARATION`, OKLab 0.02, off each of `TONE_HOSTS`. Each page ink of each host clears the text floor on it.
- The tints of two tones keep the same separation from each other unless their hues sit within `TONE_HUE_ADJACENT_DEGREES`, as Hearth's primary and warning do. No pairwise check runs: `TONE_TINT_MIN_CHROMA` is derived from that bound, so non-adjacent tints at that chroma keep the separation.
- A carried tint holds the tone's `solid` at 3:1 where a tint can, because an active rail cell paints the solid as a glyph on it. The inks outrank this floor, and seeds do not take it.
- An ink aims at the D202 derivation ratio over its floor's grounds on the page ink's side, and settles for the floor.
- A tone the scope cannot judge declares `initial`, so the role falls back to its mix. So does the primary of a scope that paints its own accent over a seed palette.
- A scope that paints its own accent and no background over a carried scope solves that primary on the outer palette: its fill, its ink, its literals and its solid steps. Every other tone keeps the outer solve. The scope learns that its ambient is carried from the scope above it, never from global state.

For that fallback the clamp still lowers the `text`, `text-on-tint`, `tint` and `tint-active` amounts on the scope's page, and it raises the neutral solid steps, nearest each default. Every tone the clamp judges paints its tints and their inks as literals judged on every host, so the knobs reach only a tone it cannot judge. Colored solid steps rise per tone, `--tone-mix-<tone>-hover` and `-active`, so one tone's fallback never flattens another's. All are emitted on the scope. The knob solve aims at the D202 derivation ratio and settles for the floor. The scope emits the primary pixel it judged. Its ink covers the fill and both steps where one ink can; else it is the fill's own ink at the polarity that leaves the steps the most contrast, and the raised steps close the gap. One fill always admits an ink above the floor, so no further fallback exists. One numeric twin in `@orb/kit/theme-derivation` serves the build, the clamp and the tests.

Homes: `packages/ui/tokens.build.ts` and `packages/ui/tokens.tones.ts` (the `tone-host-*` utilities), `packages/ui/src/content/theme-scope/` (the clamp knobs and literals), `@orb/kit/theme-derivation` (`TONE_HOSTS` and the numeric twin).

## Consequences

A tint stops showing the host behind it. A custom theme keeps chromatic status colours on a mid-lightness page.

## Alternatives rejected

- A host stamp attribute keyed by generated selectors: the variant-axis stamps never become paint selectors, and a utility keeps the fill and its host in one class string.
- Per-host literals under a carried scope: one literal judged off every host keeps one variable per role.
- A knob solve on every host: on a mid-lightness page the page ink cannot clear a tint near the popover, and no judged tone paints the knob mix.
- A `--tone-host` declared on `:root`: a root `var()` freezes to the root palette, so the fallback form reads the page on the stamped element.
- Mix-only roles under a carried scope: a mix that reaches a floor on a mid-lightness page has no chroma left, so every status colour paints grey.

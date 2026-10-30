---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# Unchecked form-control edges are nearly invisible on mid-grey custom themes

## What

On a mid-grey custom theme, an unchecked checkbox's border is nearly invisible (1.46:1 on `oklch(0.6 0 0)`). Every D159 carrier shares the static `--color-input-border`, so radio, switch and the field controls fail the same way.

Ruling: a per-primitive override is refused; it breaks D159's ceiling under the focus ring on every seed. `--color-input-border` stays static on the seeds, and under a carried custom background the ThemeScope clamp emits it, solved between the 3:1 floor and the scope's focus-ring ceiling, as the D336 knobs are. D159 is amended in place in the same commit.

## Why

Pre-existing; side-eye found it during the tone review. An unchecked control must show its boundary (WCAG 1.4.11).

## Done when

Every D159 carrier's resting edge clears 3:1 against its host and stays below the focus ring on card, in each seed and on `oklch(0.6 0 0)`, pinned by a carrier CT and a clamp unit test.

## Evidence

Cause: the unchecked edge of every form-control carrier comes from `border-input-border`, a fixed light-dark pair that no ThemeScope re-solves ([D159](../adr/0159-a-form-control-edge-and-a-decorative-divider.md)). Over a carried `oklch(0.6 0 0)` background the painted edge measured 1.46:1 against the host (edge 105,101,97 on 128,128,128). The seeds already clear 3:1, so the defect is in the shared token, not in the checkbox.

Fix: a ThemeScope that carries a background now emits `--color-input-border`, solved over its own panels. `@orb/kit/theme-derivation` `solveInputBorder` takes the nearest lightness to the base, on either side, that holds 3:1 against the background, raised, card, popover, sidebar, accent, secondary and muted panels and against the `bg-input` fill over each (8-bit pixels). When that edge is not below the accent fill on the card, the scope emits `--color-ring` as the accent's hue at the nearest lightness that clears the edge by `RING_OVER_EDGE_MARGIN` (`solveFocusRing`), leaving `--color-primary` alone. The margin is a target: when no lightness reaches it, the best ring on the hue is painted if it still sits above the edge. Only a hue with no ring above the edge leaves `ClampedTheme.inputBorderFallback` set, which the app shell's dev reporters log and `window.__orb.themeFallbacks()` reads. Homes: `packages/ui/src/content/theme-scope/derive-vars.ts` (`inputBorderOn`), `clamp.ts`, `emit-vars.ts` (`THEME_SCOPE_EMIT_VARS` and `THEME_SCOPE_STATIC_SEED_VARS`). D159 is amended in place. The checkbox skin is unchanged.

Solved values for `oklch(0.6 0 0)`: the edge is `oklch(from <base> 0.93 0 h / 1)` (3.02:1 on the card), with `--color-input` at `oklch(from <base> 0.197 0 h / 0.097)`. The scope's ink side holds no 3:1 edge there, because the fill's dark ink darkens the grounds, so the far side wins. With the inherited Hearth accent the clamp corrects the accent only to 3:1 on the card, so the ring is raised to `oklch(0.34008064 0.13955308 29.23388519)`, above the edge, and nothing is reported. With a strong accent (`oklch(0.2 0.1 260)`) the ring stays the authored `oklch(0.20205316 0.09822717 262.61672674)`. Over the accepted-base matrix with the Hearth accent, no base reports: every ring sits above its edge, and a ring short of the margin is the best its hue offers.

Proof: `tests/ui/primitives/checkbox/platform-checkbox-contrast.suite.ct.tsx` mounts checkbox, radio, switch and input over the background, card and popover hosts under Hearth, Light, Mocha and a custom ThemeScope at `oklch(0.6 0 0)`. It asserts each carrier's computed edge is the token, the edge holds 3:1 on every host in painted pixels, and the edge is below the ring on the card, for the seeds and for the custom scope with a strong and with the inherited accent. Red on the old clamp: the custom-scope case fails at 1.46:1 on Chromium; the seeds pass. Red with the ring raise disabled: the inherited-accent case fails (edge 3.049 against ring 3.027). Green on Chromium and WebKit. `tests/ui/content/theme-scope/fallback-delivery.ct.tsx` pins delivery of both fallback reporters on Chromium and WebKit, with a scope that still reports (`oklch(0.42 0 0)` under the saturated accent `oklch(0.55 0.37 300)`). `tests/ui/content/theme-scope/input-border.test.ts` reads the emitted variables back over the accepted-base matrix: red without the emit, green with it.


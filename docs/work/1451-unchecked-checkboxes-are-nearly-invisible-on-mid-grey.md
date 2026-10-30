---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
---

# Unchecked checkboxes are nearly invisible on mid-grey custom themes

## What

On a mid-grey custom theme, an unchecked checkbox's border is nearly invisible.

## Why

Pre-existing; side-eye found it during the tone review. An unchecked control must show its boundary (WCAG 1.4.11).

## Done when

The unchecked checkbox border clears 3:1 against its host in each seed and on `oklch(0.6 0 0)`, pinned by a CT.

## Evidence

Cause: the unchecked edge of every form-control carrier comes from `border-input-border`, a fixed light-dark pair that no ThemeScope re-solves ([D159](../adr/0159-a-form-control-edge-and-a-decorative-divider.md)). Over a carried `oklch(0.6 0 0)` background the painted edge measured 1.46:1 against the host (edge 105,101,97 on 128,128,128). The seeds already clear 3:1, so the defect is in the shared token, not in the checkbox.

Fix: a ThemeScope that carries a background now emits `--color-input-border`, solved over its own panels. `@orb/kit/theme-derivation` `solveInputBorder` takes the nearest lightness to the base, on either side, that holds 3:1 against the background, raised, card, popover, sidebar, accent, secondary and muted panels and against the `bg-input` fill over each (8-bit pixels). When that edge is not below the scope's focus ring on the card, the floor wins and `ClampedTheme.inputBorderFallback` reports it. Homes: `packages/ui/src/content/theme-scope/derive-vars.ts` (`inputBorderOn`), `clamp.ts`, `emit-vars.ts` (`THEME_SCOPE_EMIT_VARS` and `THEME_SCOPE_STATIC_SEED_VARS`). D159 is amended in place. The checkbox skin is unchanged.

Solved values for `oklch(0.6 0 0)`: the edge is `oklch(from <base> 0.93 0 h / 1)`, with `--color-input` at `oklch(from <base> 0.197 0 h / 0.097)`. The scope's ink side holds no 3:1 edge there, because the fill's dark ink darkens the grounds, so the far side wins. With an accent that clears the card as authored (`oklch(0.2 0.1 260)`) the edge sits below the ring. With the inherited Hearth accent the clamp corrects the accent only to 3:1 on the card, so the ring sits at the floor itself, the ceiling cannot hold, and the scope reports the fallback.

Proof: `tests/ui/primitives/checkbox/platform-checkbox-contrast.suite.ct.tsx` mounts checkbox, radio, switch and input over the background, card and popover hosts under Hearth, Light, Mocha and a custom ThemeScope at `oklch(0.6 0 0)`. It asserts each carrier's computed edge is the token, the edge holds 3:1 on every host in painted pixels, and the edge is below the ring on the card. Red on the old clamp: the custom-scope case fails at 1.46:1 on Chromium; the seeds pass. Green on Chromium and WebKit. `tests/ui/content/theme-scope/input-border.test.ts` reads the emitted variables back over the accepted-base matrix: red without the emit, green with it.

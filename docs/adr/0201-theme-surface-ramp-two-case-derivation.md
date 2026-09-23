---
kind: adr
status: active
updated: 2026-09-23
---

# The neutral surface ramp derives two cases from the same pivot

## Context

Split off [ADR 0071](0071-theme-palette-pipeline.md), whose surface-ramp rider pushed it over the 8 KiB ADR cap. A near-white base saturated the whole neutral chrome ramp to L 1.0, making low-emphasis graphics invisible on a light carried palette.

## Decision

**Rider: the SURFACE RAMP takes the same two-case shape off the same pivot.** The neutral ramp was ONE additive block (every member but `sidebar` positive), so on a near-white base every positive member saturated at L 1.0 and the chrome family collapsed into one white — measured at base `oklch(0.98 0.004 75)`: card = popover = secondary = muted = accent = sidebar-accent = surface-raised = L 1.000, i.e. `--color-muted` on `--color-card` at **1.0000:1 rendered**, which is every low-emphasis GRAPHIC (the arc meter's track, a card skeleton, a track bar) invisible on a light carried palette. `THEME_DERIVATION.ramp` is now `{ dark, light }` and `rampDeltas(base)` selects on `fgPivotL`; the DARK case is the earlier block digit-for-digit and the LIGHT case is the shipped Light seed's own value-set promoted into the derivation (base 0.98 ⇒ sidebar 0.955 · surface-raised 0.965 · card/popover 0.995 · secondary 0.94 · muted 0.95 · accent 0.93 · sidebar-accent 0.90) — neither invented, exactly as the rider did for elevation. On a light surface a raised tone is not a lighter one (there is no headroom) but a RECESSED one. An UNJUDGEABLE base keeps the DARK case rather than emitting nothing (the ramp IS the chrome; skipping it would paint app-theme panels inside a custom room), so its bytes do not move either. **The floor is measured, not WCAG 1.4.11:** two NEIGHBOURING ramp surfaces cannot reach 3:1 on any polarity — the shipped Hearth pair measures 1.1356:1 and the Light seed pair 1.1412:1 — so the pin is "a light base is never less legible than the palettes orb ships". **Two stated consequences:** `isDerivableBaseSurface`'s refused band widens at the top (0.63 → 0.686 measured, lower edge untouched) because a base just over the pivot now derives sub-AA chrome instead of clamping it out of view — the ST importer refuses those palettes, which is the predicate working; and the light case's `muted` (−0.03) sits ΔL 0.008 from the reading plate (−0.038), the same step the shipped Light seed has always had, so a light-palette skeleton-on-plate is a PRE-EXISTING open question this rider records rather than creates. Pins: `palette-contrast.suite.test.ts` (the family stays pairwise distinct on every near-white base incl. pure white + the shipped-palette floor, both red at pre-fix HEAD), `clamp.test.ts` (the dark case's eight emitted vars byte-pinned + the unjudgeable case + the accent/accent-foreground case agreement), the kit unit cases (dark block digit-for-digit, light case equals the seed's own literals, pivot agreement), and a rendered CT measuring the arc meter's track against its card (1.0000:1 red at pre-fix HEAD; the dark case's 1.1315:1 rendered as its guard).

## Consequences

`THEME_DERIVATION.ramp` is `{ dark, light }` and `rampDeltas(base)` selects on `fgPivotL`, the same pivot [ADR 0071](0071-theme-palette-pipeline.md) clause (4) and [ADR 0200](0200-theme-shadow-ingredient-derivation.md) use. The floor is measured (no polarity reaches WCAG 1.4.11's 3:1 on neighbouring ramp surfaces), not asserted. `isDerivableBaseSurface`'s refused band widened at the top (0.63 to 0.686). Pins: `palette-contrast.suite.test.ts`, `clamp.test.ts`, the kit unit cases, and the arc-meter-track CT.

## Alternatives rejected

Keep the ramp as one additive block (rejected: collapses the chrome family to one white on a near-white base, measured at L 1.0000 for six members at once).

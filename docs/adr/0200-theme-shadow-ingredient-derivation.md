---
kind: adr
status: active
updated: 2026-09-23
---

# Shadow ingredients derive per polarity from the base surface

## Context

Split off [ADR 0071](0071-theme-palette-pipeline.md), whose shadow-ingredient riders pushed it over the 8 KiB ADR cap. The pipeline's clause (1) validated seed set needed shadow-ingredient color paths, then a follow-up closed the residual by deriving and emitting them instead of seeding them per theme.

## Decision

**Rider (merged `62cb5a227`): clause (1)'s validated set gains five seed-covered SHADOW-INGREDIENT color paths** — `color.shadow-hairline` / `-highlight` / `-ambient-near` / `-ambient-far` / `-cta-highlight`, added to `SEED_COVERED_PATHS` in `tokens.build.ts` beside `color.backdrop` (same carve-out shape; oklch-only and exact-key coverage unchanged in kind). WHY ingredients and not per-theme `--shadow-*` values: Tailwind v4 INLINES a composite `@theme` shadow into its `.shadow-*` utility at build time (probed with the repo's own compiler — a `[data-theme]` override of `--shadow-overlay` moves the var and ZERO pixels), so theme-reactive shadows must be built from `var()` color ingredients (which survive inlining and resolve in scope) or relative color; the glow recipes derive from `--color-primary` via relative color so the accent glow tracks every theme including customs.

**Rider (merged `7543ca4bb`): the recorded residual is CLOSED — the five ingredients are DERIVED per polarity and EMITTED, so they left `SEED_COVERED_PATHS` for the emitted class.** `kit/theme-derivation` `shadowIngredients(base)` picks one of two cases off the base's L against the SAME `fgPivotL` the foreground flip and `color-scheme` ride (so a palette can never wear light-case elevation under dark-case text), and the clamp spells each as `oklch(from <base> <l> <c> h / <alpha>)` — hue from the palette, l/c/alpha from the case. Neither case is invented: `dark` IS the base `@theme` recipe digit-for-digit (every value chroma 0, so hue is powerless and a dark custom theme's pixels are unchanged — the sacred-rooms constraint holds by construction) and `light` is the Light seed's own measured block, promoted from a per-seed hand-tune into the derivation a custom theme gets too (the seed json's ingredient hues moved 60→75 to equal `shadowIngredients(background)` literal-for-literal, a max 0.25/255-per-channel composited move). Measured on the realistic light bases: the inherited white ring read 1.00-1.02:1 against its own page and the near-black far-ambient 3.73-3.93:1 (the "sticker" halo) — derived, 1.32-1.34:1 and 1.26-1.27:1. An UNJUDGEABLE base (a named colour) emits NO ingredient: polarity is not statically knowable and is never guessed, the same fail-open `colorSchemeFor` takes. Pins: `palette-contrast.suite.test.ts` (every shipped palette's five literals ARE the derivation, asserted through the rendered colour so the dark case's powerless hue can't hide a drift; plus the two directional properties), `clamp.test.ts` (both cases byte-pinned + the pivot-agreement + the unjudgeable case), the kit unit cases, and a rendered CT that paints the ring over the base in a canvas (red at pre-fix HEAD, dark-case pin green as its positive control). `clamp.ts` split its derived SPELLINGS into `theme-scope/derive-vars.ts` under the same size seam `color-parse.ts` was cut on.

## Consequences

The five shadow-ingredient colors (`color.shadow-hairline` / `-highlight` / `-ambient-near` / `-ambient-far` / `-cta-highlight`) are derived per polarity off the same `fgPivotL` pivot [ADR 0071](0071-theme-palette-pipeline.md) clause (4) uses, so a custom theme gets correct elevation without a seed-json hand-tune. Pins: `palette-contrast.suite.test.ts`, `clamp.test.ts`, the kit unit cases, and the ring-over-base rendered CT.

## Alternatives rejected

Keep seeding the five paths per theme json (rejected: a custom theme would ship no elevation, and a hand-tuned value drifts from the derivation silently).

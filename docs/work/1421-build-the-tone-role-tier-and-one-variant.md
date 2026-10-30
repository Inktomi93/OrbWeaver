---
kind: work
status: open
updated: 2026-10-30
priority: P1
area: ui
plan: css-system
---

# Build the tone role tier and one variant vocabulary for the ui primitives

## What

Give @orb/ui a derived role tier between the theme tokens and the primitives, and one axis vocabulary across the primitives, so every surface draws color and control size from the same few named roles.

Current defects:

- Primitives use the same axis names for different things. On Card, `tone` is color. On Badge, `intent` is color and `tone` is fill style. On Button, `intent` mixes fill style (`outline`, `ghost`, `link`, `bare`) with color (`destructive`, `primary`) and `tone` is an axis whose values are all empty.
- Each primitive hand-writes its own intent tints with opacity modifiers and `color-mix`. Badge soft success is `border-success/30 bg-success/8`; Card `successTint` is `border-success/40 bg-success/10`. The same concept paints differently.
- `CONTROL_SIZE` sets control heights only; Button adds many sizes of its own.
- Card, Text, Button, ListRow and Badge carry use-specific variant values (message bubbles, sidebar edges, drop targets, floating chips, field hosts) beside their generic axes. The layout variants in `packages/ui/src/layout/variants.ts` (`Stack`, `Row`, `Section` and the toolbar parts) carry visual-state axes (`receded`, `highlight`, `spoiler`, `lifted`, `stateFill`, `opacityMotion`, `slide`); layout primitives keep only layout axes. Other primitives are behavior-heavy with few axes and stay as they are.

[D336](../adr/0336-tone-roles-and-one-variant-vocabulary.md) owns the ruling: the tone tuple, the derived roles and their recipes, the contrast floors, `data-tone` scoping, the `tone`/`variant`/`size` vocabulary and the lint constraint. The [css-system plan](../plans/css-system/design.md) section "Tone roles and one variant vocabulary" owns the four steps, the codemods per step, the mapping tables and the flagged sites.

- [x] Step 1: role tokens, tone scoping and contrast checks.
- [ ] Step 2: axis vocabulary and lint at zero.
- [ ] Step 3: control scale.
- [ ] Step 4: use-specific extraction.

Each step lands alone and leaves the app working.

## Why

Tokens, the type ramp and spacing are already governed, yet surfaces still drift because each primitive invents its own tints, shadows and use-case variants under inconsistent axis names. A derived role tier and one vocabulary remove those choices from callers, which is what makes a design system read as consistent.

## Done when

Each plan step meets its own done line in the css-system plan. Every tone has its D336 roles in each shipped theme and under a custom ThemeScope, and the token build and the clamp hold every D336 contrast floor. The D336 lint constraint reports zero findings with no waivers. Production-mounted CTs prove each primitive's tone and variant matrix in each seed and a custom theme, and the codemods ship with fixtures.

## Evidence

Step 1:

- The token build fails a shipped palette under a D336 floor; `tests/ui/token-contract.test.ts` plants a recipe under a floor and the build refuses it. `tests/tooling/generated-css-drift.repo.int.test.ts` holds the regenerated theme, token map and appearance channel.
- `tests/ui/content/theme-scope/tone-knobs.test.ts` reads back what the clamp emits and clears every floor of every tone, neutral and primary included, over the accepted-base matrix and over picked and inherited accents on each contrast-case base. `tests/kit/theme-derivation/tone-roles.test.ts` holds the kit half.
- `tests/ui/content/theme-scope/clamp.test.ts` pins the emitted knobs against `THEME_SCOPE_EMIT_VARS` and the reported primary fallback.
- `tests/ui/content/theme-scope/emitted-contrast.ct.tsx` reads painted role pairs under each seed and a nested custom ThemeScope in the Chromium and WebKit CT projects. No CT project runs Firefox, so Firefox is unchecked.

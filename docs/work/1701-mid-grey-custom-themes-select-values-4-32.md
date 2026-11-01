---
kind: bug
status: open
updated: 2026-11-01
priority: P1
area: ui
plan: cross-surface-consistency
---

# Mid-grey custom themes: select values 4.32:1 on the field fill, slider track solved to alpha 0.001, muted/accent/secondary/popover collapse to one value, card reading ink 4.36:1 (step-4 review P2s)

## What

A carried palette near the black/white crossover mirrors its ramp arm and flips its input wash to the side with room, emits `--color-field-fill`, and solves the page and prose inks over cards, neutral tints, bubbles and field fills.

## Why

Both ramp arms step toward the crossover, so a mid-luminance base had no room on its arm's side. Projection flattened muted, accent, secondary and popover into one value, and the input alpha fell to 0.001. The field fill was a static white wash no ink was solved on, and absent prose inks were solved on the page only.

## Done when

- On `oklch(0.5 0 0)` the select value clears 4.5:1 on its field fill, and the reading ink clears 4.5:1 on a card.
- A page ink on a neutral tint, and a prose pick on a card or bubble, clear 4.5:1 on `oklch(0.43 0 0)`, `oklch(0.5 0 0)` and `oklch(0.6 0 0)`.
- The input rail keeps `inputAlpha` and paints apart from the card.
- The accent fill paints apart from muted and popover.
- Every shipped palette holds a tone's solid at 3:1 on its tints.
- The phone tab bar's active cell paints the primary tint and on-tint ink.
- A field value clears 4.5:1 on a sidebar panel, and a sidebar ink clears it on the page.

## Evidence

`tests/ui/content/theme-scope/emitted-contrast.ct.tsx` runs the mid grey and pale paper cases in the painted pixels. `tests/kit/theme-derivation/neutral-tint-ink.test.ts` sweeps the accepted bases. The design audit on an isolated stage reports zero contrast, hover-contrast and border-contrast findings for both themes.

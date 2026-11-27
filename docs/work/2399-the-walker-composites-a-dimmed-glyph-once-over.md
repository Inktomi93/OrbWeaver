---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: surface-walk
---

# The walker composites a dimmed glyph once over a pixel-sampled backdrop

## What

checks-color.ts (the pixel-sample backdrop method), checks-hover.ts (backdrops from settleHeldBackdrops) and snap's --contrast-pixel path composite the text at its full accumulated opacity over a framebuffer ring that already carries any group that also dims the paint under the text, so an outer dim is applied twice. The in-group fill under the ink is unknown on that path by construction, so the closed form inkOverRing in wcag.ts does not apply.

## Why

Dimmed text over art reads as lower contrast than the user sees, a false low on exactly the surfaces the pixel path exists for.

## Done when

The walker carries the opacity split between groups inside and at or above the base node; a pixel-sampled text with an outer dim is either withheld under a named reason or re-read from a second shot with that group's opacity lifted; each of the three paths has a red-first fixture and a control.

## Evidence

Walker paths done: a pixel-sampled text, or a held hover read, under a dimmed ancestor group that paints under the ink is withheld as outerDimOverPixels (`tooling/src/ui-audit/lib/checks-color.ts`, `checks-hover.ts`); fixtures `tests/tooling/ui-audit/ops/walker/census-text-contrast.int.test.ts` and `tests/tooling/ui-audit/ops/hover-outer-dim.int.test.ts`, each with a no-dim and an own-dim control. Open: the snap `--contrast-pixel` path in `tooling/src/snap/ops/arms/contrast.ts` still composites the full accumulated opacity over its ring; `tooling/src/snap/**` belongs to the snap lane.

---
kind: bug
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-aef904b2d3a239bff
plan: cross-surface-consistency
---

# The Icon shadow takes a theme-derived token

## What

Icon `shadow` in `packages/ui/src/primitives/icons/variants.ts` spells `drop-shadow-sm`, which resolves to the framework default, not a theme token.

## Why

ui-surface-and-interaction-rules §2.8: a glyph over art takes a theme-derived shadow token, so its legibility shadow follows the theme.

## Done when

Icon `shadow` reads a token from `packages/ui/src/tokens/tokens.json` built from the D200 ingredients, and the message action glyphs keep their contrast over art in a light and a dark palette.

## Evidence

Filled at landing: what ran and where its output is.

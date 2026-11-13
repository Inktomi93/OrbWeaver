---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: ui
plan: cross-surface-consistency
---

# Replace the flat initials tile for a character without art

## What

A character with no art shows a flat initials tile from the `@orb/ui` Avatar. Chat paints a second card-size placeholder of its own: `FallbackLetter` in `packages/client/src/features/chat/components/art-slot.tsx`, through the Text `artScale` axis in `packages/ui/src/primitives/text/variants.ts`. Make the Avatar fallback a size container whose initials scale with it, fold `FallbackLetter` into it, and delete the `artScale` axis in the same change. The fill gains a depth pigment that moves away from the ink.

## Why

At card size the flat tile reads as a broken image next to real art.

## Done when

The placeholder renders at every avatar size from one `@orb/ui` home, `FallbackLetter` and the `artScale` axis are gone, it passes contrast in every seed theme, a CT covers the small avatar and the card portrait, and a rendered review has read it.

## Evidence

Filled at landing: what ran and where its output is.

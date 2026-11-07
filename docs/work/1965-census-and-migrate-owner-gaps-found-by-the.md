---
kind: tooling
status: doing
updated: 2026-11-07
priority: P3
area: tooling
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Census and migrate-owner gaps found by the owner migrations

## What

The census cannot see classes held in constants. Its ScaleIndex holds object consts only, so FOCUS_RING and SCROLL_FADE_Y_CLASS read as unknown in a recipe variant. migrate-owner cannot plan variant-prefixed tokens. A move leaves cn(X) and a dead import behind. The census has no keep code for a gradient inside its owning recipe, a vendor inline override that needs an important modifier, SVG user-unit geometry, a DOM-API literal or dev seed data. pixelContrast's ring backdrop picks up the mark's own strokes, so a small glyph reads lower than it renders.

## Why

Hand-written classes in constants stay invisible, prefixed tokens need hand moves, and each leftover needs a hand cleanup.

## Done when

A class in a constant shows in the census, card.focusable.true reads as two classes, a prefixed token plans or refuses by name, a move leaves no single-argument cn or dead import, each shape has a keep code, and pixelContrast excludes the mark.

## Evidence

Filled at landing: what ran and where its output is.

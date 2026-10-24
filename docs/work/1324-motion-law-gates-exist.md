---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: client
plan: css-system
---

# The motion law's named gates exist

## What

`docs/law/motion-and-animation-guide.md` names `orb/no-unruled-flip-inversion` with its `homes` list ("enforced, not prose-only") and `orb/baseui-state-data-attributes`, and says CTs pin `transitionProperty` for dialog, popover, toast and tabs. None exists. requestAnimationFrame-driven motion sits in `packages/ui/src/art/web-weave/web-weave.tsx:381`, `packages/ui/src/stream/use-smooth-text.ts:103` and `features/character/components/character-filter-rail-parts.tsx:116`.

## Why

Lifecycle styling off Base UI state attributes and a closed FLIP list keep motion compositor-only and reduced-motion-safe; unenforced, they drift.

## Done when

Both rules exist with planted controls and a `homes` list that names the sanctioned rAF sites with reasons; the transition-property CTs exist for the four primitives (or the law names what does pin them); current sites conform.

## Evidence

Filled at landing: what ran and where its output is.

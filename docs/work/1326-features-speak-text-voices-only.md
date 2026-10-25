---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/css
plan: css-system
---

# Features set text voice, never size, weight, tone or transform

## What

`docs/law/UI-Density-Law.md` §2.3 says features pass `voice` to `Text` and `Heading`, never the underlying axes. 217 axis attributes sit in 93 client files (tone 132, size 69, weight 14, transform 2), for example `data/query-error-state.tsx:41`. No lint enforces it.

## Why

Voices are the typography system; per-site axes are how the type ramp sprawls.

## Done when

An ESLint `no-restricted-syntax` entry refuses `size`, `weight`, `tone` and `transform` on `Text` and `Heading` outside `packages/ui/src` (tone allowed only if the law rules it a state axis — decide and record); each site maps to an existing voice or a new ruled voice; a codemod does the mechanical mapping; a planted control fails.

## Evidence

Filled at landing: what ran and where its output is.

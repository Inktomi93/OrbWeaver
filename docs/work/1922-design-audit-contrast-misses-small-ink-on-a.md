---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: surface-walk
---

# Design audit contrast misses small ink on a translucent plate over art

## What

The design audit reports no affected text and excludes text over art as a flat backdrop on a plate where the pixel sampler measures 4.10:1. Make the audit measure what the pixels show.

## Why

A clean audit on a failing surface hides real misses.

## Done when

The audit reports that plate, and a true flat backdrop stays excluded.

## Evidence

No run, report or doc names the 4.10:1 plate as text. The one 4.10 reading on record is a composer border edge that passes its 3:1 floor, in `reports/ux-1920/readings.txt` on main. Surface walks of the owner-db clone, desktop and mobile, over every rail section, Config group and an opened chat file no contrast, gray-on-color or text-over-art finding and withhold none of those populations. The mechanism the title describes, small translucent ink on a translucent plate, was reproduced and fixed: the walker dropped the ink alpha, now carried by `tooling/src/ui-audit/ops/walker/census-text.ts` and judged by `paintedInk` in `tooling/src/ui-audit/lib/checks-color.ts`, with fixtures in `tests/tooling/ui-audit/ops/walker/census-text-contrast.int.test.ts`. A true flat backdrop stays excluded as flatBackdrop in every walked surface.

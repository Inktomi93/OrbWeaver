---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Design-audit follow-ups from the contrast branch review

## What

From the cb-contrast review: the 2375 animation detach fires animationcancel and animationstart and leaves a CSS animation-play-state pause no longer honoured afterwards; the 2386 replacement test in census-region.int.test.ts pins a refusal that is false, because no ancestor creates a stacking context there; sr-only subjects now leave the off-grid-transform and promoted-layer-offset candidates with no named reason; snap --contrast reports a clipped target as OFF-SCREEN; pixelContrast still does not show the muted chip at its true ratio.

## Why

Each is an instrument that changes the page it measures, pins a wrong answer, or drops subjects silently.

## Done when

The detach restores play-state and fires no events, or the walker reads the rest value without touching the animation; the 2386 test asserts a real refusal case; sr-only candidates leave grid rules under a named reason in the accounting; snap names a clipped target as clipped; and each has a fixture.

## Evidence

Filled at landing: what ran and where its output is.

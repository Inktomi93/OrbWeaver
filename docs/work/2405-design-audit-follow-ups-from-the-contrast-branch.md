---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
plan: surface-walk
---

# Design-audit follow-ups from the contrast branch review

## What

From the cb-contrast review: the 2375 animation detach fires animationcancel and animationstart and leaves a CSS animation-play-state pause no longer honoured afterwards; the 2386 replacement test in census-region.int.test.ts pins a refusal that is false, because no ancestor creates a stacking context there; sr-only subjects now leave the off-grid-transform and promoted-layer-offset candidates with no named reason; snap --contrast reports a clipped target as OFF-SCREEN; pixelContrast still does not show the muted chip at its true ratio.

## Why

Each is an instrument that changes the page it measures, pins a wrong answer, or drops subjects silently.

## Done when

The detach restores play-state and fires no events, or the walker reads the rest value without touching the animation; the 2386 test asserts a real refusal case; sr-only candidates leave grid rules under a named reason in the accounting; snap names a clipped target as clipped; and each has a fixture.

## Evidence

Done in the walker: the animation read leaves the phase and the stylesheet play-state alone and fires no event (CT in `tests/tooling/design-audit-walker.ct.tsx`); the negative z-index control in `tests/tooling/ui-audit/ops/walker/census-region.int.test.ts` plants a real stacking context, and the walker now judges a z-index -1 layer that falls under the section fill; sr-only transforms and promoted layers leave the grid rules as excluded(srOnly) (`tests/tooling/ui-audit/ops/walker/census-grid.int.test.ts`). Open, in `tooling/src/snap/**`: naming a clipped target as clipped in `--contrast`, and the pixelContrast chip ratio.

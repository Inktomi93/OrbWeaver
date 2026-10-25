---
kind: work
status: doing
updated: 2026-10-25
priority: P1
area: client
lane: cb-domlock
plan: css-system
---

# Feature DOM and inline style work follows the law and is locked

## What

Client features hand-roll DOM and style work: static style values on @orb/ui components (room-flank, home-recents, composer menu, reserved sizes, gallery frame, theme mini surface); model-picker reaching into cmdk internals; focus and lookup by getElementById/querySelector instead of refs; config-scroll-spy toggling classes with classList; timers and getBoundingClientRect reads that may stand in for lifecycle signals.

## Why

The paint law and motion law put paint in tokens and primitives, state styling on data attributes, and DOM access behind refs and seals; nothing enforced the cases above.

## Done when

Every listed site is fixed or justified with a runtime reason; feature static style values, sealed-library internal selectors, getElementById/querySelector outside named homes and classList writes are refused by lint at zero; each behaviour change has a CT on the real feature that fails on a planted break.

## State

- Branch `wt/agent-affa9278d3374082f` at `d3c80ac1ab`; needs a verifier.
- Merge after item 1346. Then the lane merges main and moves the two static style props its new `orb/no-static-style-prop` flags in `packages/client/src/features/chat/components/art-slot.tsx` (`:90` `lineHeight: 1`, `:127` `backgroundSize`/`backgroundRepeat`) to classes; until then main is red by 2.
- Left open by the lane (each needs a test or a lock before this item lands):
  - no CT for model-picker focus and centering end to end, add-connection failure focus, greeting remove focus, plugin hide focus, tag apply focus, connection fact-row focus, refinery landing search;
  - no measurement of the `InlineFlankFitProbe` sentinel width;
  - `connections-list-focus.ct.tsx` passes with the default focus return; the create flow where the opener unmounts is the discriminating case;
  - about twelve `.closest(...)` lookups in features are not locked; `gallery-lightbox.tsx` reaches the `@orb/ui` dialog popup by selector.
- `app-shell-command.ct.tsx` "rapid chords" and "an open New chat dialog owns the overlay" flake on main too (3 in 32).

## Evidence

Filled at landing: what ran and where its output is.

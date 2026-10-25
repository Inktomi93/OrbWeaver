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

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a60f3647a45bd36a0
---

# Rail sections and side panels move the same way

## What

Owner: switching between the left rail's main pages does not transition the same way on every page (Refinery most noticeable, subtle oddness item to item), and the side panel open and close motion may be off. Route changes ride the View Transition wrapper (routes/router-view-transition.ts, lib/view-transition-settlement.ts).

## Why

Inconsistent motion reads as jank even when subtle.

## Done when

Every rail section enters and leaves with the same transition (duration, easing, what animates), side panels open and close with one motion spec, reduced motion is honored, and snap --motion measurements per section and per panel are recorded before and after.

## Evidence

Filled at landing: what ran and where its output is.

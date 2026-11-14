---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: refinery
plan: cross-surface-consistency
---

# Refinery scrolls its content on a short landscape phone

## What

A review reported that Refinery content cannot be scrolled to its end on a phone held sideways. It was never measured. Measure it on the production surface with the pattern in `tests/client/features/app-shell/surfaces/platform-short-rail.suite.ct.tsx`; fix the scroll owner in `packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx` if the last control cannot be reached.

## Why

Content a reader cannot reach on a supported viewport is a blocked task.

## Done when

A component test at a short landscape phone size reaches the last control of each Refinery content state, and fails when the content region does not scroll.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The config list's focus on the active group's band is ruled or removed

## What

Add a focus keptSite for `packages/client/src/features/config/surfaces/config-list-surface.tsx` (value `useFocusOnMount`) in `tooling/src/ui-facts/cohorts.ts`. Its reason: the Settings band carries no primary action, so the shared list arrival falls back to a root with no visible focus, and UI-Architecture-and-Layout §4.3 rule 6 requires visible focus on arrival.

## Why

A kept site needs a cited ruling. This one has a law clause and a structural reason the census can read.

## Done when

the UI census reports no focus finding for the config list, `tests/tooling/ui-facts/ui-facts.test.ts` passes, and `tests/client/features/config/surfaces/config-list-arrival.ct.tsx` still lands focus on the active group's band.

## Evidence

Filled at landing: what ran and where its output is.

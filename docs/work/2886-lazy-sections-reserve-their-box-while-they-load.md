---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Lazy sections reserve their box while they load

## What

The theme builder reserved its first section's height because a `Suspense` with a null fallback let the page grow after readiness. The same null fallback stands in `packages/client/src/features/rpg/components/rpg-veiled-section.tsx`, `packages/client/src/features/rpg/components/rpg-hud-band.tsx`, `packages/client/src/features/chat/components/chat-list-character-filter.tsx`, `packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx` and `packages/client/src/features/discovery/components/corpus-context-header.tsx`. Measure each for growth after readiness and reserve the box where it grows.

## Why

Rows that move under the pointer after the surface claims to be settled cause wrong presses.

## Done when

Each site either has a component test that measures no growth after readiness, or reserves its box with a test that is red before and green after.

## Evidence

Filled at landing: what ran and where its output is.

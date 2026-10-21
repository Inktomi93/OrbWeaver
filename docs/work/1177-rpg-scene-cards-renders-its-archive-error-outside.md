---
kind: bug
status: open
updated: 2026-10-19
priority: P2
area: client
plan: test-foundation
---

# rpg-scene-cards renders its archive error outside the error battery

## What

packages/client/src/features/rpg/components/rpg-scene-cards.tsx:94 wraps QueryErrorState in a Stack inside the archive renderError, with no grant; it arrived with commit checks bypassed. It is a live render-error-via-battery violation and blocks that gate's native successor (1041 row 120).

## Why

Error states must render through the shared battery so every surface shows the same recoverable error.

## Done when

The archive renderError renders QueryErrorState directly with the Stack and Kicker outside the boundary, proven by a CT or snap of the error state.

## Evidence

Filled at landing: what ran and where its output is.

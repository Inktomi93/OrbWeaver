---
kind: bug
status: open
updated: 2026-10-22
priority: P2
area: client
plan: test-foundation
---

# Use the shared archive error state in RPG scene cards

## What

The archive renderError in `packages/client/src/features/rpg/components/rpg-scene-cards.tsx` wraps QueryErrorState in Stack and Kicker rather than rendering the shared error state directly.

## Why

The archive should use the shared recoverable error presentation.

## Done when

The archive renderError renders QueryErrorState directly, with surrounding layout outside the boundary. A CT or Snap check proves the error state.

## Evidence

The wrapper remains in the current component. Runtime correction and rendered acceptance remain open.

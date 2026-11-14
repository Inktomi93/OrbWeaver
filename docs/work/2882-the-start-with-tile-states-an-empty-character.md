---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: home
plan: cross-surface-consistency
---

# The Start with tile states an empty character library at shelf weight on the shelf

## What

The Start with tile in `packages/client/src/features/chat/components/home-quick-picks-tile-body.tsx` draws `EmptyState` when the library has no character. `packages/client/src/features/chat/lib/home-starter-region.ts` puts the tile on the shelf once any room exists, so a library with rooms and no character shows the pane form on the shelf. Draw the shelf form there (a label line, the door, a gloss) and keep `EmptyState` in the hearth.

## Why

The centred pane form is the only centred block in a flush-left column and takes a large share of the shelf for the one block with nothing in it.

## Done when

A component test on the production Home surface with rooms and no character shows the tile's shelf form and no `EmptyState`, and with no room shows `EmptyState` in the hearth.

## Evidence

Filled at landing: what ran and where its output is.

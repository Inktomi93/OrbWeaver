---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: character
---

# Bulk character remove shows which cards failed

## What

The bulk remove verb now returns the cards it deleted and the cards whose delete was refused. The client mutation in `packages/client/src/features/character/hooks/use-character-mutations.ts` types the result as unknown, and `packages/client/src/features/character/components/character-bulk-bar.tsx` does not read it. Show the reader which cards stayed and why.

## Why

A partial bulk remove looks like a full one, so the reader does not see that some cards are still in the library.

## Done when

A component test removes a set where one card is refused, and the bulk bar names the card that stayed.

## Evidence

Filled at landing: what ran and where its output is.

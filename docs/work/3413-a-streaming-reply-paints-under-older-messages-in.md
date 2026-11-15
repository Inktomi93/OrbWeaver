---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A streaming reply paints under older messages in a search-jump window

## What

The tail rule in `packages/client/src/features/chat/hooks/use-message-items.ts` covers only a held ghost. A live turn's ghost still appends to the bottom of a search-jump window that does not reach the tail.

## Why

A streaming reply shows out of order under older messages.

## Done when

The live ghost follows the same tail rule as the held ghost, and a component test opens a search-jump window during a stream and asserts no bubble shows there.

## Evidence

Filled at landing: what ran and where its output is.

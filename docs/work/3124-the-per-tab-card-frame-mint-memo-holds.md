---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# The per-tab card-frame mint memo holds whole reply bodies as keys

## What

`minted` in `packages/client/src/data/use-card-frame.ts` keeps its mint request bodies as Map keys up to the cache cap. A framed reply from a large HUD preset has a body of hundreds of kilobytes, so theme flips over a long session can retain tens of megabytes of key strings in a tab.

## Why

The app must run on modest hardware, including phones.

## Done when

The memo is keyed by a digest of the body, or capped by bytes, and a dom test shows the retained size stays bounded across many distinct bodies.

## Evidence

Filled at landing: what ran and where its output is.

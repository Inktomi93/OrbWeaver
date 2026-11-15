---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The reasoning collapse and the start of a swipe throw a pinned reader far off the bottom

## What

When a long reasoning trace auto-collapses on the first answer token, the transcript lands hundreds of pixels to over a thousand pixels above the bottom for a moment. A swipe on a tall reply does the same as the ghost replaces it. Then the list re-pins.

## Why

The reader loses their place exactly when the answer starts, on every thinking turn and every swipe.

## Done when

A pinned reader stays pinned through the reasoning collapse and through a swipe start, with a worst gap of a few pixels. A browser test measures the gap across a scripted collapse and a swipe.

## Evidence

Filled at landing: what ran and where its output is.

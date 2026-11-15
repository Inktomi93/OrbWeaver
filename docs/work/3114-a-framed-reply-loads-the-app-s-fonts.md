---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A framed reply loads the app's fonts

## What

The reply frame drops the app's @font-face rules: an opaque-origin frame cannot fetch /assets fonts (every app response carries Cross-Origin-Resource-Policy: same-origin, and fonts load in CORS mode). Framed prose names Geist but renders in the system fallback unless Geist is installed locally.

## Why

The owner's bar is that a framed reply reads like its neighbours; the font face is the most visible remaining difference.

## Done when

A framed reply's prose renders in the app's font face, proven by a CT that compares rendered glyph metrics (not the computed family string) with a native neighbour, with no CORP widening on the app's responses unless a ruling allows it.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: import-robustness
---

# Framed prose falls back to the system typeface

## What

The app's font files do not load in the opaque-origin frame, so framed prose renders in the system face beside Geist in native rows. D354 records this as a known gap. This may duplicate the lane's draft item on the same gap.

## Why

A framed reply looks subtly foreign next to its neighbours.

## Done when

Framed prose renders in the app's reading face, or D354 records that the gap is accepted.

## Evidence

Filled at landing: what ran and where its output is.

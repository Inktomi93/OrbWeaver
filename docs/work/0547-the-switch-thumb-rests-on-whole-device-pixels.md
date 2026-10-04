---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: ui
---

# The Switch thumb rests on whole device pixels

## What

The shared @orb/ui Switch thumb sits 0.5 device px off the pixel grid at desktop and DPR 3 (0463 P3-11, routed to the primitive owner by the automation lane).

## Why

A blurred thumb edge on every switch in the app.

## Done when

The thumb lands on whole device pixels in the design audit at DPR 1 and 3.

## Evidence

Filled at landing: what ran and where its output is.

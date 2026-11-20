---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# A frame slid under a stale tap point by a layout shift may be admitted on touch

## What

On a touch screen with a frame in process, the gate admits the frame matching :hover where the last touch landed, while the page holds an activation and no app input came within 5 s. If a layout shift moves another frame under that point, it may match :hover and be admitted. A probe in Chromium touch emulation with frames out of process did not reproduce it.

## Why

The touch fallback is the gate's one admission without a press or Tab; a hostile frame must not inherit it from a neighbour.

## Done when

An exact-geometry probe with frames in process, then either a CT showing the shifted frame refused, or the fallback tied to the frame the touch first landed on.

## Evidence

Filled at landing: what ran and where its output is.

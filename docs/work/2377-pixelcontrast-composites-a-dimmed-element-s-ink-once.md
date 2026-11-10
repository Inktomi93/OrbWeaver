---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: cross-surface-consistency
---

# pixelContrast composites a dimmed element's ink once, not twice

## What

tests/support/browser/pixel-contrast.ts composites a dimmed element's ink over a backdrop the framebuffer has already dimmed, so the muted chip's initials read 1.30 to 1 where the true composite is 3.57; the 2316 lane added pixelFilledTextContrast beside it rather than fix it.

## Why

A contrast instrument that double-dims reports defects that are not there and hides the size of real ones.

## Done when

pixelContrast reads a dimmed element's ink and backdrop from one composite, a CT shows the muted chip at its true ratio, and the two helpers become one if the second is no longer needed.

## Evidence

Filled at landing: what ran and where its output is.

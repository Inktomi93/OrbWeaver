---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# Snap contrast commands take the walker's dimmed-group and clipped-target rules

## What

The design-audit walker now withholds a dimmed ancestor group painting under the ink and leaves sr-only and clipped candidates out, but snap's --contrast-pixel path in its contrast op and --contrast still judge a dimmed group's ink, name a clipped target, and report the pixelContrast chip ratio by the old rule.

## Why

Two contrast instruments that disagree on one surface make neither trustworthy.

## Done when

Snap's contrast commands apply the walker's rules through one shared home, with red-first cases for the dimmed group, a clipped target and the chip ratio.

## Evidence

Filled at landing: what ran and where its output is.

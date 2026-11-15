---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# Held display row lands at the width and height it was held at

## What

At chat open a held reply is laid out unframed (about 597px wide, blank body) and lands framed at 324px and a different height.

## Why

The row jumps when its scripts land, which the hold exists to prevent.

## Done when

After the reply frame width fix, a held reply's box at hold and at landing match within a few pixels, checked with a snap watch at chat open.

## Evidence

Filled at landing: what ran and where its output is.

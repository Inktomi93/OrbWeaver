---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Mix tone tints over their host surface, not the page background

## What

Tone tints mix over `--color-background`, so a soft badge on a card host nearly vanishes (1.04:1 on Mocha). Give the tint recipes a host operand that surface primitives (Card, raised, popover) set, and judge the floors per host in the token build and the clamp.

## Why

Side-eye finding 7 (`reports/side-eye/2026-10-30-tone-roles-step1.md`).

## Done when

A soft badge on a card, raised or popover host shows a tint distinct from that host, at the ΔE floor, in each seed and a custom theme, pinned by a CT.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Border width family with a default every border and ring resolves through

## What

Make --border-width-\* a proper family with a default step. Point Tailwind's --default-border-width and --default-ring-width at it, so plain border, border-s and ring resolve to a token with no site edit. Move border-2 and ring-2 sites to the family.

## Why

The owner wants border weight changeable in one place, and plain border writes 1px with no token behind it.

## Done when

Changing the default step changes every plain border and ring in compiled CSS, and no site writes a numeric border width.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Focus ring offset and width are tokens

## What

Mint focus ring offset and outline width tokens and move ring-offset-2 and outline-2 onto them, in packages/ui/src/lib/focus-ring.ts and the sites outside it.

## Why

Focus ring geometry is a design value and is hand-spelled.

## Done when

Changing the tokens changes every focus ring in compiled CSS, and no site writes a numeric ring offset or outline width.

## Evidence

Filled at landing: what ran and where its output is.

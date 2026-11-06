---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Chat room polish: glass tint on the composer lift, dark seeds over bright art, keyboard pin over prose

## What

bg-muted does not paint on the composer under default glass, because the appearance layer outranks utilities, and the comment in composer-drop-target.tsx claims a lift that does not happen. On dark seeds over bright art the composer border is under 3:1 against the outside. At end of history on a plain background the keyboard pin has no edge, so its status line runs into body text. Tab out of the pager goes to the roving stop, which is item 1847's cause.

## Why

Each is small, and together they are the rough edges left on the busiest surface.

## Done when

Each is fixed or closed with the capture and reason that show it is right.

## Evidence

Filled at landing: what ran and where its output is.

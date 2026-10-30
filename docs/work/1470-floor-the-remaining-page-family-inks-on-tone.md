---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Floor the remaining page-family inks on tone tints

## What

1448 floored the page ink (--color-foreground) on every carried tone tint. Still unfloored: the interactive Card hover paints card-foreground on tint-active, muted-foreground on a tint (selected-row subtitles and meta) has no floor, and the seed palettes have no gate holding page ink on their tints (the token build checks only D336's recipe floors).

## Why

A probe found no regression today, but nothing stops one: a palette change could drop a selected-row subtitle below AA unnoticed.

## Done when

Each page-family ink on a tone tint is either floored by the kit solve and the token build's seed check, or its recipe moves to text-on-tint, with the tone-knobs matrix asserting it.

## Evidence

Filled at landing: what ran and where its output is.

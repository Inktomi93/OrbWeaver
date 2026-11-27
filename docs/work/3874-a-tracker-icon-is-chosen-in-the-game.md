---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: rpg
lane: wt/agent-ab48c9f67c391d41f
plan: unwired-code
---

# A tracker icon is chosen in the game tab and drawn beside its bar

## What

RpgTrackerDef.icon is part of the tracker shape in D113 and is stored as null; the client resolves color and never icon, and no control sets it.

## Why

The shape promises an icon the screens never draw.

## Done when

The game-tab tracker editor picks an icon from the glyph set, the panel and band draw it, and a CT covers a tracker with an icon.

## Evidence

Filled at landing: what ran and where its output is.

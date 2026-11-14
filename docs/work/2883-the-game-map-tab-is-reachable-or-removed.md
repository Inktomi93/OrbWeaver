---
kind: work
status: doing
updated: 2026-11-14
priority: P3
area: rpg
lane: wt/agent-afdb47dea54f61788
plan: cross-surface-consistency
---

# The game Map tab is reachable or removed

## What

Ruled: the Map tab is deleted unless a real data source exists. The game context section hides its Map tab with a condition that is always false in `packages/client/src/features/rpg/lib/rpg-context-section.tsx`, so `RpgMapTab` cannot be mounted through any production door. Read the tab's reader history and the server for a map read first. If no verb serves map data, delete the tab, its component, its names and its tests; if a verb does serve it, wire the tab to that read's presence.

## Why

Code no door reaches cannot be tested or reviewed, and a reader cannot tell a parked feature from a broken one.

## Done when

The tab and its component are deleted and two search methods find no reference, or the tab shows when the room has map data, with a component test through the context section. The landing note says which and why.

## Evidence

Filled at landing: what ran and where its output is.

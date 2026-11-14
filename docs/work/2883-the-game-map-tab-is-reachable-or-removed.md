---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: rpg
---

# The game Map tab is reachable or removed

## What

The game context section hides its Map tab with a condition that is always false in `packages/client/src/features/rpg/lib/rpg-context-section.tsx`, so `RpgMapTab` cannot be mounted through any production door and no test can reach it. Find why it is hidden. Then either wire the tab to the condition that should show it, or delete the tab and its component.

## Why

Code no door reaches cannot be tested or reviewed, and a reader cannot tell a parked feature from a broken one.

## Done when

The Map tab shows under a stated condition with a component test through the context section, or the tab and its component are deleted and nothing references them.

## Evidence

Filled at landing: what ran and where its output is.

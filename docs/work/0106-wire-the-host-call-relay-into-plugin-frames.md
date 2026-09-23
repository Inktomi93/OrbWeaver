---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: plugin
---

# Wire the host-call relay into plugin frames

## What

No mount of `PluginFrame` (`packages/client/src/features/plugin/components/plugin-frame.tsx`) passes `hostCall`, so every host call from a frame is refused. Pass the relay to `plugin.uiHostCall` at each anchor that mounts a frame, the same relay `plugin-scripted-surface.tsx` uses. The server gate (`fn` in `UI_PROXYABLE` and in the caller's grants) and the per-plugin in-flight cap already apply. Rewrite the header's pending-U4 paragraph to state the wired behavior.

## Why

The owner ruled that a frame gets the same server-gated host access as a scripted surface.

## Done when

Every frame anchor passes `hostCall`. A test proves a frame's granted call is relayed and answered, and a call outside the plugin's grants is still refused.

## Evidence

Filled at landing: what ran and where its output is.

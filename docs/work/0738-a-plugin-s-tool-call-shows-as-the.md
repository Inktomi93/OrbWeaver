---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# A plugin's tool call shows as the raw generic tool block

## What

The narrator's Story Clocks call renders as plugin_story\_\_clocks_advance_clock with Success and a millisecond count. Final pass leg 2; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Raw tool ids in the transcript read as debug output.

## Done when

A plugin tool call in the transcript shows the tool's display name and a readable result line.

## Evidence

Lane S6: plugin.listSurfaces has no per-tool display name, there is no structured result line, and ToolCallBlock is the shared primitive for every tool; needs a display-name field on tool registration (pairs with the 0740 SDK change).

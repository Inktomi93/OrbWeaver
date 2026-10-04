---
kind: bug
status: doing
updated: 2026-10-04
priority: P3
area: plugin
lane: wt/agent-ad435ab6e19d39557
---

# A plugin's tool call shows as the raw generic tool block

## What

The narrator's Story Clocks call renders as plugin_story\_\_clocks_advance_clock with Success and a millisecond count. Final pass leg 2; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Raw tool ids in the transcript read as debug output.

## Done when

A plugin tool call in the transcript shows the tool's display name and a readable result line.

## Evidence

Filled at landing: what ran and where its output is.

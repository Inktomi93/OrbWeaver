---
kind: bug
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Read-only switch lock glyph needs its own ink

## What

The lock glyph on a read-only OFF switch reads under the non-text contrast bar on Light and mid-grey themes, and it dims with the resting thumb. Give the glyph its own ink instead of inheriting the thumb's opacity.

## Why

A read-only state a person cannot see is a state the switch does not show.

## Done when

The glyph measures at least 3:1 against the thumb on every seed theme in a framebuffer CT, with the thumb ceiling unchanged.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: plugins
---

# The plugin host's stacked-settlement test holds under load

## What

A plugin host test that stacks settlements sizes its work to the box's speed and failed in full-suite runs at load, then passed alone. Its siblings were rewritten to hold a call at the parent for a fixed time and are red against their defects.

## Why

A test that fails with load gets ignored, and the bound it proves goes unwatched.

## Done when

The test holds its condition by a fixed hold at the parent or an injected seam, passes in the full plugin host run at load, and is red against its defect.

## Evidence

Filled at landing: what ran and where its output is.

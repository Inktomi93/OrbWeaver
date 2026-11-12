---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: plugins
---

# The plugin membrane's slow-setter row holds under load

## What

A plugin host test in which a snippet builds its surface under slow setters failed in full plugin host runs at load and passed alone, for two different runners. It is a different row from the stacked-settlement one already boarded.

## Why

A test that fails with load gets ignored, and the bound it proves goes unwatched.

## Done when

The row holds its condition by a fixed hold or an injected seam instead of work sized to the box's speed, passes in the full plugin host run at load, and is red against its defect.

## Evidence

Filled at landing: what ran and where its output is.

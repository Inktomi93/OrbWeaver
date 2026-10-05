---
kind: bug
status: doing
updated: 2026-10-05
priority: P2
area: client
lane: codex/launch-truth
---

# The preset editor and readout describe the same connection

## What

The params editor gates on the chat role's capability (preset-editor-surface.tsx) while the readout follows Connection in view (capability-panel.tsx), so they disagree on a Utility model (fp13-presets-util.png). Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Both describe the connection in view, or the editor names the connection it shows, with a test.

## Evidence

Filled at landing: what ran and where its output is.

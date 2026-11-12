---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: surface-walk
---

# The preset editor's header controls and tab strip widen its pane at the largest phone text

## What

At phone width and the largest browser text the preset editor's pane scrolls sideways by more than its own width. A header button with a badge and the tab strip's list both end far past the pane. Measurements are in the row title lane report under reports/lanes.

## Why

A pane that scrolls sideways has stopped reflowing, and the editor is where a phone user spends their time on a preset.

## Done when

At phone width and the largest text the editor's pane does not scroll sideways, shown by a component test on the production editor that reads the pane's scroll width, red on the current editor.

## Evidence

Filled at landing: what ran and where its output is.

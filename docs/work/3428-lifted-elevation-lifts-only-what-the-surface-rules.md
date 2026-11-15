---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# Lifted elevation lifts only what the surface rules allow

## What

Under `glow`, `packages/client/src/features/app-shell/surfaces/shell/grid.css` casts `--shadow-overlay` on every docked pane on a desktop, and `packages/client/src/styles/globals.css` puts a drop shadow on the first child of every surface root in the grid. ui-surface-and-interaction-rules §2.2 and §2.4 say docked chrome never casts and the setting lifts only raised-in-flow surfaces and sliding panes.

## Why

The setting paints a float shadow on chrome that is level with the content, which is the class of the phone bar seam.

## Done when

The owner has answered the first question in ui-surface-and-interaction-rules §7; the stylesheets follow the answer; the Appearance copy for Lifted says what it changes; before and after captures at desktop width under each elevation value.

## Evidence

Filled at landing: what ran and where its output is.

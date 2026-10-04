---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: plugin
---

# The plugin reveal dialog names its plugin

## What

The reveal dialog's name and heading are the generic 'Plugin', it nests the plugin card inside the modal card, and the order list does not mark dealt cards. Final pass leg 2 (plugins); review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-2-plugins.md.

## Why

Plugin final pass finding.

## Done when

The dialog is named for the plugin, renders without a nested card, and marks dealt cards.

## Evidence

Lane S4 refused: the modal title is a static ModalDefinition.title, the nested card is the shared PluginSurfaceShell chrome, and Mark dealt cards is Oracle Deck bundle content; needs a modal-host change.

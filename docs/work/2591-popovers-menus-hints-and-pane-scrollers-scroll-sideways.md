---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# Popovers, menus, hints and pane scrollers scroll sideways at enlarged text

## What

popover-popup, menu-popup, hint-popup, shell-panel-body and the refinery, corpus finder, home, transcript and categorized-library pane scrollers scroll sideways on a phone (kinds K3, K10 to K14, K18, K26, K28). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

A column that scrolls sideways has stopped reflowing.

## Done when

The rerun names each widening descendant, each is fixed to wrap, and the walk lists no sideways finding on those checkpoints.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# A menu or popover that closes itself before a section swap fades with the old screen

## What

Dialogs and the palette now fade with the outgoing screen when a section swap closes them, because closeModal joins a swap started in the same task; Base UI menus and popovers that close themselves before the swap starts still vanish on the first frame.

## Why

The same kind of float leaves a swap two different ways.

## Done when

Every float a swap closes fades with the outgoing screen, proven by a component test that holds the swap's first frame with a menu and a popover open.

## Evidence

Filled at landing: what ran and where its output is.

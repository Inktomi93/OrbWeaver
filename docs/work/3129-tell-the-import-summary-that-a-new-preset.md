---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Tell the import summary that a new preset is not in use until activated

## What

An imported preset lands un-activated while the built-in stays active. The import summary says nothing about it; the editor header's Activate and the Used by readout explain it only after the dialog closes.

## Why

In SillyTavern picking a preset is using it, so a first user expects her import to apply to her chats.

## Done when

The import summary carries one line saying the preset is used once activated, and a CT pins it.

## Evidence

Filled at landing: what ran and where its output is.

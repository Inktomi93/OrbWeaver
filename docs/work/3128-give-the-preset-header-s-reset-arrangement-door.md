---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Give the preset header's reset-arrangement door its own glyph or a text label

## What

preset-editor-header.tsx renders 'Reset to starter arrangement' as a bare RotateCcw icon beside the Saved status, the same glyph every knob row uses for 'Reset to inherited'.

## Why

One glyph means a one-knob reset in the deck and a whole-preset reset in the header; a user can reach for the wrong scope.

## Done when

The header door uses a distinct glyph or sits in an overflow menu with its text label, and the confirm dialog stays.

## Evidence

Filled at landing: what ran and where its output is.

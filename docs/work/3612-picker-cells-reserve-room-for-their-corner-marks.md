---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: ui
plan: cross-surface-consistency
---

# Picker cells reserve room for their corner marks

## What

On the theme picker the menu chip and the selected check sit over the preview's title bar because the picker cell places corner marks without reserving room for them (packages/ui/src/primitives/picker-cell/variants.ts, packages/client/src/features/app-shell/components/appearance-looks-section.tsx, the theme mini surface). Three other picker families draw a check over their art and may share the defect.

## Why

A mark drawn over the art's own chrome reads as a rendering glitch.

## Done when

The picker cell reserves its corner marks at the primitive, no theme cell overlaps its preview chrome at any width, every picker family using the cell is checked, and a component test pins the clearance.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: doing
updated: 2026-10-28
priority: P2
area: client
lane: plugin_inventory_finish
plan: surface-walk
---

# Restore focus to the Preset Chat history pivot after editing

## What

AssemblyRack passes focus restoration to ordinary SectionRow entries but omits it for PivotBand. Wire the existing focus mechanism into the pivot edit button.

## Why

The production Presets walkthrough loses keyboard focus when returning from the Chat history editor.

## Done when

Prove the existing defect through the real Preset surface, then verify Back returns focus to Edit Chat history without changing other row behavior. Retain the native walkthrough focus assertion.

## Evidence

Filled at landing: what ran and where its output is.

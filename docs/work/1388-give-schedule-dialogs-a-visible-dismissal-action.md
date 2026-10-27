---
kind: bug
status: open
updated: 2026-10-27
priority: P2
area: client
---

# Give schedule dialogs a visible dismissal action

## What

Add the existing FormDialog visible dismissal affordance to both CreateScheduleDialog and EditScheduleDialog.

## Why

The forms expose Save but no visible Cancel or Close. Escape works, but the shared dialog contract requires a visible exit, including on touch devices.

## Done when

Verify both real schedule dialogs at desktop, phone portrait and short landscape sizes. Dismiss without saving and preserve focus return and schedule values. Reuse the existing dialog API rather than another overlay or policy framework.

## Evidence

Filled at landing: what ran and where its output is.

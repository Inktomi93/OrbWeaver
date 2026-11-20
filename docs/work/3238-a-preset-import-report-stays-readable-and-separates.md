---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: preset
---

# A preset import report stays readable and separates changed from dropped values

## What

In `packages/client/src/features/preset/components/preset-import-dialog.tsx` the report closes with the dialog on success, and values clamped on import are listed as dropped. Keep the report readable after commit and separate a changed value from a dropped one.

## Why

An owner cannot tell what the import changed after the dialog closes.

## Done when

A component test finds the report on screen after a successful import with clamped and dropped values listed separately.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# One sheet composite draws the phone drawer chrome for the modal host and the plugin flank sheet

## What

The phone sheet chrome (keyboard provider, popup, title and close row) is written in both modal-host.tsx and plugin-flank-sheet.tsx. One sheet composite owns it and both draw it. The plugin flank sheet sits in the plugin area; sequence it after the plugin host branch.

## Why

Two spellings of one chrome drift apart.

## Done when

Both files draw one composite, no feature imports the drawer primitive, and a component test covers the composite on each caller.

## Evidence

Filled at landing: what ran and where its output is.

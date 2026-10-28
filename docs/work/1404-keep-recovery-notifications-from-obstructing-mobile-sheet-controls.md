---
kind: work
status: open
updated: 2026-10-28
priority: P2
area: client
plan: cross-surface-consistency
---

# Keep recovery notifications from obstructing mobile sheet controls

## What

Review shared notification placement when a mobile Context sheet reports a save failure. The error notification covers the Characters details close control until dismissed.

## Why

A real pointer interaction in the Character selection recovery case is obstructed by the notification. Normal dismissal works, but the layout competes with the recovery controls.

## Done when

Choose and implement shared notification placement that preserves access to sheet controls at supported phone sizes. Verify actual hit targets and notification dismissal through production composition without forced clicks or hidden findings.

## Evidence

Filled at landing: what ran and where its output is.

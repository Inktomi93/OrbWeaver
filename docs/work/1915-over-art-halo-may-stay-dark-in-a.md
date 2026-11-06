---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Over-art halo may stay dark in a light carried room under a dark viewer

## What

text-shadow resolves light-dark at shell-main and inherits, so a nested light scope can keep the dark halo. Test a light carried room under a dark viewer over a wallpaper.

## Why

Dark smoke under dark ink is the defect the shadow token change removed for ordinary light themes.

## Done when

A rendered case shows the halo matches the room's polarity, or the item closes with the capture that shows it does.

## Evidence

Filled at landing: what ran and where its output is.

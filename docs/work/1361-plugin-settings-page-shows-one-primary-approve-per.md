---
kind: bug
status: doing
updated: 2026-10-25
priority: P2
area: client
lane: closeout/rendered
---

# Plugin settings page shows one primary Approve per pending plugin

## What

With real corpus data, the settings plugins group renders an 'Approve all for <plugin>' primary button for every pending plugin, so nine primaries share one page. The surface-census CT case 'settings group plugins reads clean' fails on second-primary once plugin.list is served from the corpus root. Either give each plugin its own region so each holds one primary, or demote the per-plugin Approve to secondary.

## Why

UI-Density-Law allows one primary action per region; a stack of equal primaries leaves the user without a clear next step. A hand-empty plugin.list responder hid the defect.

## Done when

The census case passes against corpus-served plugin.list with no waiver and no fixed responder; the chosen shape is recorded here.

## Evidence

Filled at landing: what ran and where its output is.

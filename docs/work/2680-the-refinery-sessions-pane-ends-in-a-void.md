---
kind: bug
status: blocked
updated: 2026-11-14
priority: P3
area: client
blocked: on 2336
plan: cross-surface-consistency
---

# The Refinery Sessions pane ends in a void

## What

The pane-ink census excludes a region whose lowest ink is a list or listbox of member rows, because the shell gives the region its height and the list's end is the data's end. A region that ends in prose or a glance still counts.

## Why

A LIST pane and a library landing cannot earn height without inventing content, and the shell owns their height.

## Done when

`tests/support/browser/surface-measurement.ct.tsx` has a short member list in a tall region (no finding) and short prose in a tall region (finding), red before and green after for the list case. A design audit of the Refinery Sessions pane and of the Config Personas and World Info landings reports no pane-ink finding. Any Config landing still reported is filed as its own item for a designed landing state.

## Evidence

Filled at landing: what ran and where its output is.

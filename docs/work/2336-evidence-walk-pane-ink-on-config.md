---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: pane-ink on Config

## What

The pane-ink census excludes a region whose lowest ink is a list or listbox of member rows, because the shell gives the region its height and the list's end is the data's end. A region that ends in prose or a glance still counts.

## Why

A LIST pane and a library landing cannot earn height without inventing content, and the shell owns their height.

## Done when

`tests/support/browser/surface-measurement.ct.tsx` has a short member list in a tall region (no finding) and short prose in a tall region (finding), red before and green after for the list case. A design audit of the Refinery Sessions pane and of the Config Personas and World Info landings reports no pane-ink finding. Any Config landing still reported is filed as its own item for a designed landing state.

## Evidence

Triage (local lane cb-q2): real. On 19 Config group landings (about, personas, world info) the content ends at about a third of a 952px content pane (pane-ink floor 0.45, tooling/src/ui-audit/lib/checks-structure.ts:177-200). The rule's own header names the fix a design decision; shrinking the region breaks the content surface's scroll geometry (config-content-surface.tsx). Needs a rendered look before a fix: the landing either earns the height or the pane sheds it.

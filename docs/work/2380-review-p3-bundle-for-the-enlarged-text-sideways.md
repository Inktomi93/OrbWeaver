---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Review P3 bundle for the enlarged-text sideways fixes

## What

Ask ux-reviewer to judge the character facet row's wrap at default text and keep or revert it. Floor the Ripple phone portrait so the row share shrinks it only when enlarged text grows it past the owner-ruled phone width. List the Text `wrapRow` flow and Toggle's wrap in UI-Density-Law §4.3. Move the control wrap classes of Toggle, Button and Select to one constant in `packages/ui/src/lib/`.

## Why

Each is a visible change no one reviewed, or a record that no longer matches the code.

## Done when

the ux-reviewer verdict is recorded in the item, the Ripple portrait measures the owner-ruled width at 320px and default text in a component test, the law rows list both wrap axes, and one constant holds the wrap classes.

## Evidence

Filled at landing: what ran and where its output is.

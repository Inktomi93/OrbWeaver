---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# The settings details Related rows share the bullet list's text edge

## What

The settings details pane now draws its bullets through the shared BulletList with one indent, but the Related door rows below it start a little further in, so the pane still has two text edges.

## Why

Two text edges in one short pane read as a misalignment.

## Done when

The Related rows and the bullet list share one text edge, measured at desktop and phone widths, with a component test.

## Evidence

Filled at landing: what ran and where its output is.

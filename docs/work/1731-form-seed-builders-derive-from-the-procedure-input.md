---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Form seed builders derive from the procedure input (Omit of the view by the input's keys), so a widened view cannot ride an upcast into a strict input

## What

Derive each form seed builder's type from the procedure input, as the view type minus the keys the input names, so a widened view cannot ride an upcast into a strict input.

## Why

A seed builder typed by the view lets a field added to the view reach a strict procedure input through an upcast, with no compile error.

## Done when

Each form seed builder in packages/client takes its type from the procedure input. Adding a view field that the input rejects makes the typecheck fail, and a planted case shows it.

## Evidence

Filled at landing: what ran and where its output is.

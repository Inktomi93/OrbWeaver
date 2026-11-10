---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: testing
plan: cross-surface-consistency
---

# SortableList has a pointer-drag CT at both grip placements

## What

The repo has keyboard reorder CTs for the @orb/ui SortableList but no pointer-drag CT, and the grip now has two placements: beside the row above the cq-16 list width, stacked above it below.

## Why

Pointer drag is the primary reorder path on a desktop and the stacked grip is new geometry; a regression there would ship unseen.

## Done when

A production-mounted CT drags a row by its grip with the pointer at both list widths and asserts the new order, in Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.

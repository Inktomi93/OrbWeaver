---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Landscape keyboard composer test reads a zero box under display contents

## What

Cause: the keyboard-up rule in packages/client/src/styles/globals.css sets the composer-input row to display: contents, so its own getBoundingClientRect is 0x0 and the test's row overlap read the upper row's bottom edge (51 and 85). On screen the rows do not overlap. The test now measures the rows' children when the row has no box of its own, in expectRowsFit and in the keyboard-layout facts, and keeps every assertion.

## Why

A red test on main hides a real regression if one lands in the same place, and the keyboard layout is a phone reading path.

## Done when

The cause is named, and the test passes against a real measurement of the rendered rows.

## Evidence

Filled at landing: what ran and where its output is.

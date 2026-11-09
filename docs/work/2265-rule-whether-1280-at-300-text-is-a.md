---
kind: decision
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Rule whether 1280 at 300% text is a desktop regime

## What

At 300% text a 1280-wide viewport resolves to the mobile shell, so CT cells named 1280 at 3x measure the phone layout.

## Why

Cells that name a desktop width but measure the phone shell report coverage the suite does not have.

## Done when

A ruling states which shell 1280 at 300% is, and the text-scale cells are named and asserted by the regime they measure.

## Evidence

Filled at landing: what ran and where its output is.

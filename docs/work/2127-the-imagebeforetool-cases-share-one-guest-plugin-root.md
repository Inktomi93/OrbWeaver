---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# The imageBeforeTool cases share one guest plugin root

## What

The imageBeforeTool cases install the same guest plugin four times. Share one root across them, and bring corpus-image-variants under its budget for 1785.

## Why

Repeated installs cost wall time in a suite that is near its time budget.

## Done when

The cases install the plugin once and still assert each case's own outcome, and the image-variants suite runs within its budget.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# Discover results collapse to no height at the largest text on a phone

## What

The corpus Discover results scroller reads no height over its content (kind K21). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

The results cannot be reached.

## Done when

The scroller keeps a usable height in a component test, and the walk lists no collapsed scroller there.

## Evidence

Filled at landing: what ran and where its output is.

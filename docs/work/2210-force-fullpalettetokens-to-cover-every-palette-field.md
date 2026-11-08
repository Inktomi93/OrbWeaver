---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Force fullPaletteTokens to cover every palette field

## What

fullPaletteTokens in the contrast stories claims every field but is not forced to include a newly added one.

## Why

A new palette field is silently missing from the contrast stories.

## Done when

The helper is typed or derived so a new palette field fails typecheck or a case until it is covered.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
---

# The component gallery build appends its source directive twice

## What

`componentGallery()` in `packages/client/vite.config.ts` appends the Tailwind `@source` line for the tests tree on each transform, so the gallery stylesheet carries it twice and the build prints a duplicate warning.

## Why

The warning hides real ones in the component test build output.

## Done when

The directive is appended once and the gallery build prints no duplicate warning.

## Evidence

Filled at landing: what ran and where its output is.

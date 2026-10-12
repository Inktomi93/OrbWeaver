---
kind: tooling
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Pre-commit runs Biome and typecheck only

## What

Change the pre-commit and pre-merge-commit selection to Biome and the native typecheck over the staged change, plus the commit-message check, per D317. ESLint, dependency-cruiser and the structure walk leave the commit selection; CI's static job owns them.

## Why

The hook repeated most of CI's static job on every commit, which every lane paid for.

## Done when

A staged commit runs only Biome, the typecheck of the affected programs and the commit-message check; the selection tests prove it; lefthook.yml and UNIFIED-VERIFICATION-DESIGN.md section 4.3 say so.

## Evidence

Filled at landing: what ran and where its output is.

---
kind: tooling
status: open
updated: 2026-10-04
priority: P2
area: tooling
---

# Biome's test-API autofix rewrites code in non-test files

## What

lint/nursery/useConsistentTestIt read a variable named fit in packages/server/src/entry/compose/refinery.ts as Jasmine's fit and autofixed fit.violations into it.only (found in the 0518 lane; a failing compose test caught it).

## Why

A lint autofix that silently changes production semantics is worse than no rule.

## Done when

The rule runs only on test files (biome overrides by glob) or is off; a fixture with a variable named fit in a source file is left untouched by biome --write.

## Evidence

Filled at landing: what ran and where its output is.

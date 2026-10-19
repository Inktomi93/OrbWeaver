---
kind: work
status: open
updated: 2026-10-19
priority: P3
plan: test-foundation
---

# semantic-inventory-extract.ts splits along its families

## What

tooling/src/floor/compiler/semantic-inventory-extract.ts is far over the tooling max-lines cap and grows with each family.

## Why

It is red under native ESLint and every lane touching extraction edits one huge file.

## Done when

The extractor splits into per-family modules under the cap with unchanged extraction output on the scoped worlds.

## Evidence

Filled at landing: what ran and where its output is.

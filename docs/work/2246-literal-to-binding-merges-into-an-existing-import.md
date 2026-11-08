---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# literal-to-binding merges into an existing import from the same module

## What

When a file already imports from a module, the literal-to-binding codemod adds a second import line instead of merging the new names into it.

## Why

A second import from one module needs a hand fix and can trip the import lint.

## Done when

The codemod merges into an existing import from the same module, with a fixture where the file already imports from it.

## Evidence

Filled at landing: what ran and where its output is.

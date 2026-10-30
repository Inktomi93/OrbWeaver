---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Close the named-import holes in three client lint rules

## What

no-raw-zustand-persist and mutation-only-in-factory match only a named import, so a namespace or aliased import passes; no-effect-on-shared-selection has a narrow scope. Found by the law audit.

## Why

A guard that a different import spelling bypasses is not a guard.

## Done when

Each rule refuses the namespace and aliased spellings, with planted failing cases and passing controls in the rule tests.

## Evidence

Filled at landing: what ran and where its output is.

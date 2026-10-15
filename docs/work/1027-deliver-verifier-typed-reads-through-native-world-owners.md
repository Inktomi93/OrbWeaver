---
kind: tooling
status: open
updated: 2026-10-15
priority: P1
area: tooling
plan: test-foundation
---

# Deliver verifier typed reads through native world owners

## What

Route maintained verifier typed reads through canonical native source and checker views. Preserve the separate cheap syntax scan and importing-world meaning. Reuse the run-owned lazy workspace without eager world enumeration or private compiler programs.

## Why

The ordinary verifier context still constructs a pure-AST workspace; it does not establish registered native Node or browser ownership for typed readers.

## Done when

Actual structure and scoped entrypoints preserve native options, roots, closure and world-specific interpretations. Missing or stale native ownership refuses. Native entrypoint controls and finding equivalence distinguish correct Node and browser meanings without synthetic merged programs or compiler floods.

## Evidence

Filled at landing: what ran and where its output is.

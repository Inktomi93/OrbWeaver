---
kind: tooling
status: doing
updated: 2026-10-15
priority: P1
area: tooling
lane: codex/type-homes-981
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

Reviewed `f6d8656ea2` adds run-owned lazy native source acquisition and qualifies actual generated-token delivery through structure and scoped preparation. Its skipped-owner demand defect is corrected. This bounded family preserves separate Node/browser contexts and does not replace the ordinary syntax checker.

The generic dispatcher still supplies its input Project checker and syntax nodes to non-syntax owners. The inventory exposes stored identity/reference facts, not native Type, signature or assignability queries. Replacing every typed reader with syntax carriers would lose meaning; retaining every native world in the parent would lose the memory boundary. The active lane owns the first concrete semantic-family delivery proposal through the existing floor and compiler-worker owners.

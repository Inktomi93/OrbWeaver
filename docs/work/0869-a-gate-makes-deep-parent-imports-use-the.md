---
kind: tooling
status: doing
updated: 2026-10-11
priority: P2
area: tooling
lane: wt/agent-ab4068ef65b2864f9
---

# A gate makes deep parent imports use the package subpath

## What

Inside packages, many src files use ../ parent imports, some three or more levels deep; law rule 2 says # subpath imports intra-package, but no gate enforces it.

## Why

Owner ruling: enforce # over deep relative imports.

## Done when

A structure gate refuses parent-relative imports deeper than one level inside a package (exact next-step message naming the # specifier), the existing deep chains are migrated, and the gate has mustFlag and mustPass proofs plus a real-corpus liveness pin.

## Evidence

Filled at landing: what ran and where its output is.

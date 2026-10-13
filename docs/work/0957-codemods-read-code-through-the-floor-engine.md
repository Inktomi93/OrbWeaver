---
kind: work
status: doing
updated: 2026-10-13
priority: P2
lane: codex/codemod-readers-957
plan: test-foundation
---

# Codemods read code through the floor engine

## What

`tooling/src/codemod/lib` keeps its own readers for imports, exports, id casts and relocation. Route the read side of each codemod through the floor engine so a codemod changes exactly what a gate flags.

## Why

A codemod that reads code differently from the gate it serves leaves findings behind or rewrites the wrong sites.

## Done when

Codemod read paths call the floor engine; each codemod's dry-run plan is unchanged on a fixture corpus.

## Evidence

The current batch routes exported declarations, export origins, static import closure and imported Vitest binding identity through existing floor readers. Native manipulation, importer relations and broader relocation grammar remain native. Preservation fixtures and affected checks are queued through main; this source batch does not complete every codemod reader.

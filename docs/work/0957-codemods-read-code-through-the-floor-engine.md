---
kind: work
status: open
updated: 2026-10-12
priority: P2
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

Filled at landing: what ran and where its output is.

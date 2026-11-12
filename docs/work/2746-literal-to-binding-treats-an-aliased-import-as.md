---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: test-foundation
---

# literal-to-binding treats an aliased import as unbound

## What

`tooling/src/codemods/literal-to-binding/scripts/codemod.ts` sees `import { X as Y }` and takes `X` as the name in scope, so it writes an unbound `X` and adds no import. The typecheck catches the result.

## Why

A run over a file with an aliased import leaves code that does not compile, and the author fixes it by hand.

## Done when

A codemod fixture with an aliased import rewrites to the alias, or adds the import, and compiles.

## Evidence

Filled at landing: what ran and where its output is.

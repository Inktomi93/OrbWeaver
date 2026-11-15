---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: world-info
---

# The lorebook key cap has one home

## What

`packages/client/src/features/world-info/components/entry-editor.tsx` declares a local copy of the keys cap that the contract schema keeps private in `packages/contracts/src/world-info/schemas.ts`. Export the contract constant and import it in the editor.

## Why

A cap spelled in more than one place drifts, and the editor's chip picker then accepts what the server refuses.

## Done when

The editor imports the contract constant and no local copy of the cap remains.

## Evidence

Filled at landing: what ran and where its output is.
